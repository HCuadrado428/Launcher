const { ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { Client, Authenticator } = require('minecraft-launcher-core');
const { VANILLA_ROOT, LOGS_DIR, instanceDir } = require('./paths');
const { redactSecrets, parseMclcLaunchFailure } = require('./utils');
const { loadConfig, saveConfig } = require('./config');
const { isPlausibleJavaPath, requiredJavaMajorFor, getInstalledJavaMajor } = require('./java');
const { getInstalledVanillaVersions, getMinecraftVersionToLaunch } = require('./mojang');
const { syncModpack } = require('./modpackSync');
const { resolveJavaForVersion } = require('./javaRuntime');
const { targetKeyFor, saveTargetSettings } = require('./targetSettings');
const { sanitizeMemory, quickPlayForServer } = require('./gameOptions');
const { analyzeCrashLog } = require('./crashAnalysis');
const { ensureFreshMinecraftAuth } = require('./msAuth');
const { Auth } = require('./msmcLoader');
const { sendToWindow } = require('./windowState');
const { notify } = require('./notify');
const { tm } = require('./i18nMain');

// ============================================================================
// LANZAR / DETENER EL JUEGO
// ============================================================================

const launcher = new Client();

// Estado del juego. gameProcess solo existe mientras Minecraft está abierto
// de verdad; launchInProgress cubre todo lo anterior (sincronizar el
// modpack, descargar Java o la versión...), que puede durar minutos.
let gameProcess = null;
let runningInstanceKey = null;
let launchInProgress = false;
let launchCancelRequested = false;
let stopRequestedByUser = false;
let lastLaunchFailureReason = null;
let playSessionStart = null;
let playSessionTargetKey = null;

function sendGameStatus(payload) {
    sendToWindow('game-status', payload);
}

// Mientras Minecraft está abierto con una instancia, Windows tiene sus .jar
// bloqueados: sincronizar/reparar/borrar a la vez fallaba a medias.
function assertInstanceNotInUse(modpackId) {
    if (gameProcess && runningInstanceKey === targetKeyFor(modpackId)) {
        throw new Error(tm('sys.instanceInUse'));
    }
}

// --- Crash logs ---

// Buffer del log de la partida actual, para poder volcarlo a disco si el
// juego se cierra con error (si el jugador no tenía la consola abierta, se
// perdía). Se reinicia en cada lanzamiento y guarda como mucho las últimas
// MAX_GAME_LOG_CHUNKS salidas: una partida larga con mods que escriben mucho
// podía acumular cientos de MB aquí.
let currentGameLogLines = [];
const MAX_GAME_LOG_CHUNKS = 5000;
const CRASH_LOGS_DIR = LOGS_DIR;
const MAX_CRASH_LOG_FILES = 20;
let lastCrashLogPath = null;

// Devuelve la ruta del log guardado, o null si no se pudo guardar.
function persistCrashLog(code, logText) {
    try {
        fs.mkdirSync(CRASH_LOGS_DIR, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(CRASH_LOGS_DIR, `crash-${stamp}.log`);
        fs.writeFileSync(filePath, `Exit code: ${code}\n\n${logText}`);

        // No dejamos que la carpeta crezca sin límite: nos quedamos solo con
        // los MAX_CRASH_LOG_FILES más recientes.
        const files = fs.readdirSync(CRASH_LOGS_DIR)
            .filter((f) => f.startsWith('crash-') && f.endsWith('.log'))
            .sort();
        const excess = files.length - MAX_CRASH_LOG_FILES;
        for (let i = 0; i < excess; i++) {
            fs.unlinkSync(path.join(CRASH_LOGS_DIR, files[i]));
        }
        return filePath;
    } catch (err) {
        console.error('[ERROR] No se pudo guardar el log de crash:', err);
        return null;
    }
}

// --- Eventos de minecraft-launcher-core ---

launcher.on('debug', (e) => {
    const line = redactSecrets(e);
    console.log(`[DEBUG] ${line}`);
    const failureReason = parseMclcLaunchFailure(line);
    if (failureReason) lastLaunchFailureReason = failureReason;
});

launcher.on('data', (e) => {
    const text = redactSecrets(e);
    console.log(`[GAME] ${text}`);
    currentGameLogLines.push(text);
    if (currentGameLogLines.length > MAX_GAME_LOG_CHUNKS) {
        currentGameLogLines.splice(0, currentGameLogLines.length - MAX_GAME_LOG_CHUNKS);
    }
    sendToWindow('game-log', text);
});

launcher.on('progress', (e) => sendToWindow('game-progress', e));
launcher.on('download-status', (e) => sendToWindow('game-progress', e));

launcher.on('close', (code) => {
    // minecraft-launcher-core también emite 'close' (con código 1) cuando la
    // comprobación de Java falla DENTRO de launch(), antes de que exista
    // ningún proceso. Ese caso ya lo notifica launchGame (launch() devuelve
    // null); aquí se ignora para no guardar un crash log vacío de un juego
    // que nunca llegó a abrirse.
    if (!gameProcess) return;
    console.log(`[CLOSE] El juego se cerró con código ${code}`);
    const stoppedByUser = stopRequestedByUser;
    gameProcess = null;
    runningInstanceKey = null;
    stopRequestedByUser = false;

    if (playSessionStart) {
        const minutesPlayed = (Date.now() - playSessionStart) / 60000;
        const key = playSessionTargetKey || 'vanilla';
        const playtime = { ...(loadConfig().playtime || {}) };
        playtime[key] = (playtime[key] || 0) + minutesPlayed;
        saveConfig({ playtime });
        playSessionStart = null;
        playSessionTargetKey = null;
    }

    // Al pulsar "Detener" el proceso muere con código 1 (Windows) o null
    // (señal): eso no es un crash y no merece ni log ni aviso.
    if (code === 0 || stoppedByUser) {
        sendGameStatus({ type: stoppedByUser ? 'stopped' : 'closed', code });
        return;
    }

    const logText = currentGameLogLines.join('');
    lastCrashLogPath = persistCrashLog(code, logText);
    sendGameStatus({
        type: 'closed',
        code,
        crashHint: analyzeCrashLog(logText),
        hasCrashLog: Boolean(lastCrashLogPath)
    });
    notify('Ember Launcher', tm('sys.notify.crashed', { code }));
});

// --- Lanzamiento ---

// Credenciales para el juego. Con Microsoft, renueva el token si ha caducado
// (y guarda el nuevo en la cuenta activa y en la lista de cuentas). Si no se
// puede renovar, se sigue igualmente avisando: un mundo individual funciona
// con un token caducado, solo los servidores online lo rechazan.
async function authorizationFor(account) {
    if (account.type !== 'microsoft') return Authenticator.getAuth(account.username);

    const { auth, refreshed, expired } = await ensureFreshMinecraftAuth(account.auth, Auth);
    if (refreshed) {
        const cfg = loadConfig();
        const accounts = (cfg.accounts || []).map((a) => (a.id === account.id ? { ...a, auth } : a));
        const patch = { accounts };
        if (cfg.account && cfg.account.id === account.id) patch.account = { ...cfg.account, auth };
        saveConfig(patch);
    }
    if (expired) sendGameStatus({ type: 'warning', message: tm('sys.game.msSessionExpired') });
    return auth;
}

// Si el jugador pulsó "Detener" mientras se preparaba el lanzamiento, se
// para en el siguiente punto seguro (tras sincronizar, antes de abrir Java).
function cancelLaunchIfRequested() {
    if (!launchCancelRequested) return false;
    sendGameStatus({ type: 'stopped' });
    return true;
}

// Versión de Minecraft y carpeta raíz de la instalación activa. Con un
// modpack, sincroniza antes (descarga/borra mods, instala el loader, y de
// paso detecta si el modpack fue eliminado). Devuelve null si ya se ha
// avisado al renderer de por qué no se puede seguir.
async function prepareInstallation(activeModpack) {
    if (activeModpack) {
        let synced;
        try {
            synced = await syncModpack(activeModpack.id);
        } catch (err) {
            if (err.status === 404 || err.status === 403) {
                // No borramos la carpeta de la instancia: puede contener mundos
                // guardados del jugador que quiera conservar aunque pierda acceso
                // al modpack (por ejemplo, si el dueño lo vuelve a compartir).
                saveConfig({ activeModpack: null });
                sendGameStatus({ type: 'modpack-removed', message: tm('sys.game.modpackRemoved', { name: activeModpack.name }) });
                return null;
            }
            sendGameStatus({ type: 'error', message: tm('sys.game.syncFailed', { reason: err.message }) });
            return null;
        }
        return { versionNumber: synced.mc_version, loaderVersionId: synced.loader_version_id, root: instanceDir(activeModpack.id) };
    }

    const resolved = await getMinecraftVersionToLaunch();
    if (resolved.fallback) {
        const key = getInstalledVanillaVersions().length ? 'sys.game.versionFallbackInstalled' : 'sys.game.versionFallback';
        sendGameStatus({ type: 'version-fallback-warning', message: tm(key, { version: resolved.version }) });
    }
    return { versionNumber: resolved.version, loaderVersionId: null, root: VANILLA_ROOT };
}

// Java para esta partida: el que indicó el jugador o, si el campo está
// vacío, el runtime oficial para esa versión (descargándolo si hace falta).
async function prepareJava(explicitJavaPath, versionNumber) {
    const java = await resolveJavaForVersion(versionNumber, explicitJavaPath, (major, done, total) => {
        sendToWindow('game-progress', { type: tm('sys.progress.java', { major }), task: done, total });
    });
    if (java.warning) {
        sendGameStatus({ type: 'warning', message: tm('sys.game.javaDownloadFailed', { major: java.majorVersion, reason: java.warning }) });
    }
    if (!java.path) {
        sendGameStatus({ type: 'error', message: tm('sys.game.noJava') });
        return null;
    }

    if (!java.auto) {
        const requiredJavaMajor = requiredJavaMajorFor(versionNumber);
        const installedJavaMajor = await getInstalledJavaMajor(java.path);
        if (installedJavaMajor && installedJavaMajor < requiredJavaMajor) {
            sendGameStatus({
                type: 'java-warning',
                message: tm('sys.game.javaTooOld', { version: versionNumber, required: requiredJavaMajor, installed: installedJavaMajor })
            });
        }
    }
    return java.path;
}

async function launchGame({ javaPath, memory, customArgs, server }) {
    const cfg = loadConfig();
    const account = cfg.account;
    if (!account) {
        sendGameStatus({ type: 'error', message: tm('sys.game.noAccount') });
        return;
    }

    // Vacío = Java automático. Si hay algo escrito, tiene que ser un
    // ejecutable java/javaw (ver isPlausibleJavaPath).
    const explicitJavaPath = typeof javaPath === 'string' ? javaPath.trim() : '';
    if (explicitJavaPath && !isPlausibleJavaPath(explicitJavaPath)) {
        sendGameStatus({ type: 'error', message: tm('sys.game.invalidJavaPath') });
        return;
    }

    const finalMemory = sanitizeMemory(memory);
    const finalCustomArgs = typeof customArgs === 'string' ? customArgs.trim() : '';
    const activeModpack = cfg.activeModpack;
    const targetKey = targetKeyFor(activeModpack && activeModpack.id);
    saveTargetSettings(activeModpack && activeModpack.id, { javaPath: explicitJavaPath, memory: finalMemory, customArgs: finalCustomArgs });

    const installation = await prepareInstallation(activeModpack);
    if (!installation) return;
    const { versionNumber, loaderVersionId, root } = installation;
    sendGameStatus({ type: 'version-selected', version: versionNumber });
    if (cancelLaunchIfRequested()) return;

    const finalJavaPath = await prepareJava(explicitJavaPath, versionNumber);
    if (!finalJavaPath) return;
    if (cancelLaunchIfRequested()) return;

    const quickPlay = server ? quickPlayForServer(server, versionNumber) : null;
    const opts = {
        clientPackage: null,
        authorization: await authorizationFor(account),
        root,
        javaPath: finalJavaPath,
        skipVersionCheck: true,
        version: loaderVersionId
            ? { number: versionNumber, type: 'release', custom: loaderVersionId }
            : { number: versionNumber, type: 'release' },
        memory: finalMemory,
        ...(finalCustomArgs ? { customArgs: finalCustomArgs.split(/\s+/).filter(Boolean) } : {}),
        ...(quickPlay ? { quickPlay } : {})
    };

    currentGameLogLines = [];
    lastLaunchFailureReason = null;
    // launch() nunca lanza: si algo falla (Java que no arranca, versión que
    // no se pudo descargar...) lo cuenta en un evento "debug" y devuelve
    // null. Hay que comprobarlo o la interfaz se queda en "Juego iniciado".
    const child = await launcher.launch(opts);
    if (!child) {
        sendGameStatus({
            type: 'error',
            message: lastLaunchFailureReason
                ? tm('sys.game.launchFailed', { reason: lastLaunchFailureReason })
                : tm('sys.game.launchFailedUnknown')
        });
        return;
    }

    gameProcess = child;
    runningInstanceKey = targetKey;
    playSessionStart = Date.now();
    playSessionTargetKey = targetKey;

    if (launchCancelRequested) {
        // "Detener" llegó mientras launch() descargaba/preparaba: el proceso
        // ya existe, así que se cierra y el evento 'close' avisa al renderer.
        stopRequestedByUser = true;
        child.kill();
        return;
    }
    sendGameStatus({ type: 'launched' });
}

function registerGameIpc() {
    ipcMain.on('launch-game', async (event, options = {}) => {
        if (launchInProgress || gameProcess) {
            sendGameStatus({ type: 'warning', message: tm('sys.game.alreadyRunning') });
            return;
        }
        launchInProgress = true;
        launchCancelRequested = false;
        try {
            await launchGame(options || {});
        } catch (err) {
            console.error('[ERROR] Fallo al lanzar el juego:', err);
            sendGameStatus({ type: 'error', message: err && err.message ? err.message : String(err) });
        } finally {
            launchInProgress = false;
            launchCancelRequested = false;
        }
    });

    // El aviso 'stopped' lo manda el evento 'close' cuando el proceso termina
    // de verdad (y así no se toma por un crash). Si todavía se está
    // preparando el lanzamiento, se cancela en el siguiente punto seguro.
    ipcMain.on('stop-game', () => {
        if (gameProcess) {
            console.log('[STOP] Deteniendo el juego...');
            stopRequestedByUser = true;
            gameProcess.kill();
        } else if (launchInProgress) {
            launchCancelRequested = true;
        } else {
            // Nada que parar: el renderer iba desincronizado, se le devuelve
            // al estado de reposo.
            sendGameStatus({ type: 'stopped' });
        }
    });

    ipcMain.handle('open-crash-logs-folder', () => {
        fs.mkdirSync(CRASH_LOGS_DIR, { recursive: true });
        shell.openPath(CRASH_LOGS_DIR);
    });

    // Abre el último crash log guardado en esta sesión (botón del aviso de
    // crash). No recibe ninguna ruta del renderer.
    ipcMain.handle('open-last-crash-log', () => {
        if (lastCrashLogPath && fs.existsSync(lastCrashLogPath)) shell.openPath(lastCrashLogPath);
    });

    // Minutos totales jugados con este modpack (o "vanilla"), acumulados en
    // local cada vez que se cierra una partida. Es solo un contador
    // cosmético, no se sincroniza con el servidor.
    ipcMain.handle('get-playtime', (event, { modpackId } = {}) => {
        const playtime = loadConfig().playtime || {};
        return playtime[targetKeyFor(modpackId)] || 0;
    });
}

module.exports = { registerGameIpc, assertInstanceNotInUse };
