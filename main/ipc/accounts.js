const { app, ipcMain, dialog } = require('electron');
const os = require('os');
const { loadConfig, saveConfig } = require('../config');
const { fetchWithTimeout } = require('../httpUtils');
const { getBackendUrl, offlineUuidFromUsername, verifyOfflineSessionWithBackend, verifySessionWithBackend } = require('../backend');
const { findNewestJava } = require('../java');
const { getMinecraftVersionToLaunch, getReleaseVersionsToShow } = require('../mojang');
const { getTargetSettings } = require('../targetSettings');
const { recommendedMemoryGb } = require('../syncChanges');
const { loadInstanceMeta } = require('../modpackSync');
const { upsertAccount, toPublicAccount } = require('../accountUtils');
const { getMainWindow } = require('../windowState');
const { tm } = require('../i18nMain');

// ============================================================================
// IPC: CONFIG, CUENTAS Y AJUSTES
// ============================================================================

const { Auth } = require('../msmcLoader');

// La primera vez que se abre el launcher todavía no hay idioma guardado; en
// vez de arrancar siempre en español, probamos a adivinarlo del idioma del
// sistema operativo (si está entre los que soportamos).
const SUPPORTED_LANGUAGES = ['es', 'en', 'fr', 'de', 'pt'];

// Avisa al backend para que invalide el JWT de inmediato (token_version).
// Es un "mejor esfuerzo": si el backend no responde, no bloqueamos el
// logout local por eso, simplemente el token seguirá siendo técnicamente
// válido en el servidor hasta que caduque solo a los 30 días.
async function bestEffortBackendLogout(token) {
    if (!token) return;
    try {
        await fetchWithTimeout(`${getBackendUrl()}/api/auth/logout`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        }, 8000);
    } catch (err) {
        console.warn('[WARN] No se pudo avisar al backend del logout:', err.message);
    }
}

function registerAccountsIpc() {
    ipcMain.handle('get-config', () => {
        let cfg = loadConfig();
        if (!cfg.language) {
            const systemLang = (app.getLocale() || 'es').slice(0, 2).toLowerCase();
            cfg = saveConfig({ language: SUPPORTED_LANGUAGES.includes(systemLang) ? systemLang : 'es' });
        }
        // cfg.account trae el token/auth interno (necesario para el propio
        // proceso principal); el renderer solo recibe la versión pública, la
        // misma que devuelven login/switch-account.
        return { ...cfg, account: cfg.account ? toPublicAccount(cfg.account) : cfg.account };
    });

    ipcMain.handle('get-target-settings', (event, { modpackId } = {}) => getTargetSettings(modpackId));

    ipcMain.handle('login-offline', async (event, username) => {
        const name = (username || 'Jugador').trim() || 'Jugador';
        const account = { id: `offline:${name.toLowerCase()}`, type: 'offline', username: name, uuid: offlineUuidFromUsername(name) };

        // Las cuentas offline pueden crear y unirse a modpacks: el backend
        // las registra como "no premium" (no pueden compartir/generar
        // invitaciones). Si el backend no está disponible no bloqueamos el
        // login local: simplemente no habrá modpacks hasta que responda.
        let session = null;
        try {
            const verified = await verifyOfflineSessionWithBackend(name);
            session = { token: verified.token, uuid: verified.uuid, username: verified.username, premium: false };
        } catch (err) {
            console.warn('[WARN] No se pudo registrar la cuenta offline con el backend de modpacks:', err.message);
        }
        account.session = session;

        const accounts = upsertAccount(loadConfig().accounts || [], account);
        saveConfig({ account, session, activeModpack: null, accounts, activeAccountId: account.id });
        return toPublicAccount(account);
    });

    ipcMain.handle('login-microsoft', async () => {
        if (!Auth) return { success: false, message: tm('sys.msmcMissing') };

        try {
            const authManager = new Auth('select_account');
            const xboxManager = await authManager.launch('electron');
            const token = await xboxManager.getMinecraft();
            // mclc(true) guarda también el refresh token de Microsoft, para
            // poder renovar la sesión antes de cada partida (ver msAuth.js).
            const mclcAuth = token.mclc(true);

            const account = {
                id: `ms:${mclcAuth.uuid}`,
                type: 'microsoft',
                username: mclcAuth.name,
                uuid: mclcAuth.uuid,
                auth: mclcAuth
            };

            // Además de guardar la cuenta para jugar, se verifica la sesión
            // contra el backend de modpacks. Esa sesión se guarda dentro de la
            // cuenta para poder restaurarla al volver a ella sin re-loguear.
            // Si falla no se bloquea el login: se puede jugar igualmente.
            let session = null;
            try {
                const verified = await verifySessionWithBackend(mclcAuth.access_token);
                session = { token: verified.token, uuid: verified.uuid, username: verified.username, premium: !!verified.premium };
            } catch (err) {
                console.warn('[WARN] No se pudo verificar la sesión con el backend de modpacks:', err.message);
            }
            account.session = session;

            const accounts = upsertAccount(loadConfig().accounts || [], account);
            saveConfig({ account, session, accounts, activeAccountId: account.id });
            return { success: true, account: toPublicAccount(account) };
        } catch (err) {
            console.error('[ERROR] Login con Microsoft fallido:', err);
            return { success: false, message: err && err.message ? err.message : tm('sys.msLoginFailed') };
        }
    });

    ipcMain.handle('logout', async () => {
        const cfg = loadConfig();
        if (cfg.session && cfg.session.token) await bestEffortBackendLogout(cfg.session.token);
        saveConfig({ account: null, session: null, activeModpack: null, activeAccountId: null });
        return true;
    });

    ipcMain.handle('get-accounts', () => (loadConfig().accounts || []).map(toPublicAccount));

    ipcMain.handle('switch-account', (event, { id } = {}) => {
        const found = (loadConfig().accounts || []).find((a) => a.id === id);
        if (!found) throw new Error(tm('sys.accountGone'));

        const account = { id: found.id, type: found.type, username: found.username, uuid: found.uuid, auth: found.auth, session: found.session || null };
        // Cambiar de cuenta implica soltar el modpack activo (los modpacks
        // están ligados a la identidad de quien los creó/tiene acceso). No se
        // cierra la sesión de la cuenta que se deja: así se puede volver.
        saveConfig({ account, session: found.session || null, activeModpack: null, activeAccountId: found.id });
        return toPublicAccount(account);
    });

    ipcMain.handle('remove-account', async (event, { id } = {}) => {
        const cfg = loadConfig();
        const patch = { accounts: (cfg.accounts || []).filter((a) => a.id !== id) };
        const wasActive = cfg.activeAccountId === id;
        if (wasActive) {
            if (cfg.session && cfg.session.token) await bestEffortBackendLogout(cfg.session.token);
            Object.assign(patch, { account: null, session: null, activeAccountId: null, activeModpack: null });
        }
        saveConfig(patch);
        return { removedActive: wasActive };
    });

    ipcMain.handle('select-java-path', async () => {
        const result = await dialog.showOpenDialog(getMainWindow(), {
            title: tm('sys.dialog.selectJava'),
            properties: ['openFile'],
            filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : []
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('auto-detect-java', () => findNewestJava());

    ipcMain.handle('get-latest-mc-version', async () => (await getMinecraftVersionToLaunch()).version);
    ipcMain.handle('get-release-versions', () => getReleaseVersionsToShow());

    ipcMain.handle('set-language', (event, lang) => saveConfig({ language: SUPPORTED_LANGUAGES.includes(lang) ? lang : 'es' }));
    ipcMain.handle('set-color-theme', (event, theme) => saveConfig({ colorTheme: theme }));
    ipcMain.handle('set-hide-while-playing', (event, enabled) => saveConfig({ hideWhilePlaying: Boolean(enabled) }));

    // RAM sugerida para la instalación: según los mods que tiene la
    // instancia en local (sin tocar la red) y la RAM del sistema.
    ipcMain.handle('get-recommended-memory', (event, { modpackId } = {}) => {
        const modCount = modpackId ? (loadInstanceMeta(modpackId).mods || []).filter((m) => (m.type || 'mod') === 'mod').length : 0;
        const systemRamGb = Math.round(os.totalmem() / (1024 ** 3));
        return { gb: recommendedMemoryGb(modCount, systemRamGb), modCount };
    });

    // Elección local del jugador sobre qué mods "opcionales" de un modpack
    // quiere tener instalados (ver computeSyncPlan). Ausencia de entrada =
    // incluido.
    ipcMain.handle('get-optional-mod-choices', (event, { id } = {}) => {
        const cfg = loadConfig();
        return (cfg.optionalModChoices && cfg.optionalModChoices[id]) || {};
    });

    ipcMain.handle('set-optional-mod-choice', (event, { id, modId, included } = {}) => {
        const optionalModChoices = { ...(loadConfig().optionalModChoices || {}) };
        optionalModChoices[id] = { ...(optionalModChoices[id] || {}), [modId]: Boolean(included) };
        saveConfig({ optionalModChoices });
        return optionalModChoices[id];
    });

    // La búsqueda/descarga de CurseForge todavía no está activa: sus términos
    // de uso prohíben cachear datos o hacer de proxy, así que cuando se
    // implemente tendrá que llamar a su API directamente desde aquí con la
    // key de cada usuario. De momento solo se guarda la key.
    ipcMain.handle('set-curseforge-api-key', (event, apiKey) => saveConfig({ curseforgeApiKey: apiKey || '' }));
}

module.exports = { registerAccountsIpc };
