const { app, BrowserWindow, ipcMain, dialog, Notification, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const yazl = require('yazl');
const { Client, Authenticator } = require('minecraft-launcher-core');
const launcher = new Client();

const { autoUpdater } = require('electron-updater');

const { INSTANCES_DIR, VANILLA_ROOT, instanceDir, instanceModsDir, instanceResourcePacksDir, instanceDirForModType, instanceMetaPath } = require('./main/paths');
const { runWithConcurrencyLimit, sha1File, formatBytesMain, getFreeDiskSpaceBytes } = require('./main/utils');
const windowState = require('./main/windowState');
const { fetchWithTimeout } = require('./main/httpUtils');
const { loadConfig, saveConfig } = require('./main/config');
const { findNewestJava, requiredJavaMajorFor, getInstalledJavaMajor } = require('./main/java');
const { getBackendUrl, apiRequest, offlineUuidFromUsername, verifyOfflineSessionWithBackend, verifySessionWithBackend } = require('./main/backend');
const { getInstalledVanillaVersions, getMinecraftVersionToLaunch, getReleaseVersionsToShow } = require('./main/mojang');
const { getForgeVersionsForMc, getFabricVersionsForMc, installLoaderForInstance } = require('./main/loaders');
const { searchModrinth, resolveBestModrinthVersion } = require('./main/modrinth');
const { findCurseForgeInstances, findModrinthInstances } = require('./main/localScan');

// msmc se carga de forma "segura": si el usuario todavía no ha hecho
// `npm install`, no queremos que la app entera crashee al arrancar,
// solo que el login con Microsoft avise del problema.
let Auth = null;
try {
    ({ Auth } = require('msmc'));
} catch (err) {
    console.warn('[WARN] msmc no está instalado. Ejecuta "npm install" para poder usar el login con Microsoft.');
}

let mainWindow;
let gameProcess = null;
let pendingDeepLink = null;
let tray = null;
let isQuitting = false;
let playSessionStart = null;
let playSessionTargetKey = null;

// Buffer del log de la partida actual, solo para poder volcarlo a disco si
// el juego crashea (código de cierre != 0). Antes vivía únicamente en la
// consola del renderer (gameLogLines allí), así que si el jugador cerraba el
// launcher sin haber mirado la consola, el log del crash se perdía para
// siempre. Se reinicia en cada "launch-game".
let currentGameLogLines = [];
const CRASH_LOGS_DIR = path.join(app.getPath('userData'), 'crash-logs');
const MAX_CRASH_LOG_FILES = 20;

function persistCrashLog(code) {
    try {
        fs.mkdirSync(CRASH_LOGS_DIR, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(CRASH_LOGS_DIR, `crash-${stamp}.log`);
        fs.writeFileSync(filePath, `Código de salida: ${code}\n\n${currentGameLogLines.join('\n')}`);

        // No dejamos que la carpeta crezca sin límite: nos quedamos solo con
        // los MAX_CRASH_LOG_FILES más recientes.
        const files = fs.readdirSync(CRASH_LOGS_DIR)
            .filter((f) => f.startsWith('crash-') && f.endsWith('.log'))
            .sort();
        const excess = files.length - MAX_CRASH_LOG_FILES;
        for (let i = 0; i < excess; i++) {
            fs.unlinkSync(path.join(CRASH_LOGS_DIR, files[i]));
        }
    } catch (err) {
        console.error('[ERROR] No se pudo guardar el log de crash:', err);
    }
}

const APP_ICON_PATH = path.join(__dirname, 'build', 'icon.ico');


// Se guarda en memoria entre el escaneo y la importación para no tener que
// volver a mandar (ni recalcular) la lista completa de mods resueltos por
// IPC dos veces.
let lastScannedModrinthInstances = [];

// ============================================================================
// INSTANCIAS DE MODPACKS EN DISCO
// ============================================================================

function loadInstanceMeta(modpackId) {
    try {
        return JSON.parse(fs.readFileSync(instanceMetaPath(modpackId), 'utf-8'));
    } catch (err) {
        return { version_hash: null, mods: [] };
    }
}
function saveInstanceMeta(modpackId, meta) {
    fs.mkdirSync(instanceDir(modpackId), { recursive: true });
    fs.writeFileSync(instanceMetaPath(modpackId), JSON.stringify(meta, null, 2));
}

async function downloadModFile(modpackId, mod, destPath) {
    // Los mods con source 'modrinth' (u otras fuentes externas en el futuro)
    // se descargan directamente del CDN de origen; los subidos a mano pasan
    // por nuestro propio backend, como siempre.
    // Timeout más largo que el de las llamadas normales a la API: aquí se
    // cuenta la descarga completa del archivo, no solo la respuesta inicial,
    // y un mod puede pesar bastante en una conexión lenta.
    const DOWNLOAD_TIMEOUT_MS = 120000;

    if (mod.source && mod.source !== 'upload' && mod.download_url) {
        const res = await fetchWithTimeout(mod.download_url, {}, DOWNLOAD_TIMEOUT_MS);
        if (!res.ok) throw new Error(`No se pudo descargar ${mod.filename} desde ${mod.source} (estado ${res.status}).`);
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(destPath, buffer);
        return;
    }

    const cfg = loadConfig();
    const res = await fetchWithTimeout(`${getBackendUrl()}/api/modpacks/${modpackId}/mods/${mod.id}/download`, {
        headers: { Authorization: `Bearer ${cfg.session.token}` }
    }, DOWNLOAD_TIMEOUT_MS);
    if (!res.ok) throw new Error(`No se pudo descargar ${mod.filename} (estado ${res.status}).`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
}

// Sincronizar puede llegar a descargar miles de archivos pequeños en
// paralelo (librerías/assets de Minecraft), y con un antivirus escaneando
// cada archivo nuevo al vuelo eso satura el disco y la CPU del sistema
// entero, no solo del launcher ("todo el ordenador va lento"). Bajarle la
// prioridad al proceso mientras dura la sincronización no reduce el trabajo
// en sí, pero le dice a Windows que priorice cualquier otra cosa que el
// usuario esté haciendo mientras tanto.
async function syncModpack(modpackId) {
    let priorityLowered = false;
    try {
        os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
        priorityLowered = true;
    } catch (err) {
        // Alguna plataforma/permiso no lo soporta; no es crítico, seguimos igual.
    }
    try {
        return await syncModpackImpl(modpackId);
    } finally {
        if (priorityLowered) {
            try { os.setPriority(process.pid, os.constants.priority.PRIORITY_NORMAL); } catch (err) { /* ignorar */ }
        }
    }
}

async function syncModpackImpl(modpackId) {
    const manifest = await apiRequest(`/api/modpacks/${modpackId}/manifest`);
    const localMeta = loadInstanceMeta(modpackId);
    fs.mkdirSync(instanceModsDir(modpackId), { recursive: true });
    fs.mkdirSync(instanceResourcePacksDir(modpackId), { recursive: true });

    // Los mods antiguos sincronizados antes de que existiera "type" no lo
    // tienen guardado en el meta local; se asumen mods normales.
    // Los mods marcados "optional" en el manifiesto se incluyen salvo que el
    // jugador los haya desmarcado explícitamente (elección local, por
    // modpack+mod; ausencia = incluido, igual que el comportamiento de
    // siempre, así que nada cambia hasta que alguien desmarca algo).
    const cfgForOptional = loadConfig();
    const optionalChoices = (cfgForOptional.optionalModChoices && cfgForOptional.optionalModChoices[modpackId]) || {};
    const remoteMods = manifest.mods
        .map(m => ({ type: 'mod', ...m })) // [{id, filename, filesize, sha1, type}]
        .filter(m => !(m.optional && optionalChoices[m.id] === false));
    const localMods = (localMeta.mods || []).map(m => ({ type: 'mod', ...m }));

    const remoteById = new Map(remoteMods.map(m => [m.id, m]));
    const localById = new Map(localMods.map(m => [m.id, m]));

    const toDelete = localMods.filter(m => !remoteById.has(m.id));
    const toDownload = remoteMods.filter(m => {
        const local = localById.get(m.id);
        return !local || local.sha1 !== m.sha1;
    });

    // Loader/versión que hará falta instalar (calculado ya aquí, y no más
    // abajo como antes, porque el chequeo de espacio en disco necesita saber
    // si hay que contar el hueco extra que ocupa instalar Forge/Fabric).
    const loader = manifest.loader || 'vanilla';
    const requestedLoaderVersion = manifest.loader_version || '';
    let loaderVersionId = localMeta.loader_version_id || null;
    const versionJsonPath = loaderVersionId
        ? path.join(instanceDir(modpackId), 'versions', loaderVersionId, `${loaderVersionId}.json`)
        : null;
    const needsLoaderInstall = loader !== 'vanilla' && (
        localMeta.loader !== loader ||
        localMeta.mc_version !== manifest.mc_version ||
        (localMeta.requested_loader_version || '') !== requestedLoaderVersion ||
        !loaderVersionId ||
        !fs.existsSync(versionJsonPath)
    );

    const totalDownloadBytes = toDownload.reduce((sum, m) => sum + (m.filesize || 0), 0);
    if (mainWindow && totalDownloadBytes > 0) {
        mainWindow.webContents.send('modpack-download-estimate', {
            modpackId,
            totalBytes: totalDownloadBytes,
            fileCount: toDownload.length
        });
    }

    // El instalador de Forge/Fabric descarga sus propias librerías y assets
    // vanilla (puede rondar varios cientos de MB), así que sumamos un colchón
    // aproximado al comprobar espacio libre, además de un margen de seguridad.
    const LOADER_INSTALL_BUFFER_BYTES = 700 * 1024 * 1024;
    const SAFETY_MARGIN_BYTES = 200 * 1024 * 1024;
    const requiredBytes = totalDownloadBytes + (needsLoaderInstall ? LOADER_INSTALL_BUFFER_BYTES : 0) + SAFETY_MARGIN_BYTES;
    const freeBytes = getFreeDiskSpaceBytes(INSTANCES_DIR);
    if (freeBytes !== null && freeBytes < requiredBytes) {
        throw new Error(`No hay suficiente espacio en disco: hacen falta unos ${formatBytesMain(requiredBytes)} y solo quedan ${formatBytesMain(freeBytes)} libres.`);
    }

    const totalSteps = toDelete.length + toDownload.length;
    let doneSteps = 0;

    const sendProgress = (label) => {
        doneSteps++;
        const percent = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 100;
        if (mainWindow) {
            mainWindow.webContents.send('modpack-sync-progress', { label, percent, modpackId });
        }
    };

    for (const mod of toDelete) {
        const filePath = path.join(instanceDirForModType(modpackId, mod), mod.filename);
        try { fs.unlinkSync(filePath); } catch (err) { /* ya no estaba */ }
        sendProgress(`Quitando ${mod.filename}...`);
    }

    // Antes se bajaban de uno en uno; con varios a la vez (límite moderado,
    // no sin límite como las librerías de Minecraft) se aprovecha mejor la
    // conexión sin volver a saturar el sistema de golpe.
    await runWithConcurrencyLimit(toDownload, 4, async (mod) => {
        const destPath = path.join(instanceDirForModType(modpackId, mod), mod.filename);
        await downloadModFile(modpackId, mod, destPath);
        const actualSha1 = await sha1File(destPath);
        if (actualSha1 !== mod.sha1) {
            throw new Error(`El archivo ${mod.filename} se descargó pero no coincide con el original (posible corrupción). Vuelve a intentarlo.`);
        }
        sendProgress(`Descargando ${mod.filename}...`);
    });

    // Instalamos Forge/Fabric si hace falta (needsLoaderInstall se calculó
    // arriba). Se cachea vía .launcher-meta.json para no reinstalar el
    // loader en cada sincronización si no ha cambiado.
    if (needsLoaderInstall) {
        if (mainWindow) mainWindow.webContents.send('modpack-sync-progress', { label: `Instalando ${loader}...`, percent: 0, modpackId });
        loaderVersionId = await installLoaderForInstance(modpackId, manifest.mc_version, loader, requestedLoaderVersion);
        if (mainWindow) mainWindow.webContents.send('modpack-sync-progress', { label: `${loader} instalado`, percent: 100, modpackId });
    } else if (loader === 'vanilla') {
        loaderVersionId = null;
    }

    saveInstanceMeta(modpackId, {
        version_hash: manifest.version_hash,
        mods: remoteMods,
        loader,
        mc_version: manifest.mc_version,
        requested_loader_version: requestedLoaderVersion,
        loader_version_id: loaderVersionId
    });

    return {
        name: manifest.name,
        mc_version: manifest.mc_version,
        loader,
        loader_version: requestedLoaderVersion,
        version_hash: manifest.version_hash,
        loader_version_id: loaderVersionId
    };
}

// ============================================================================
// BANDEJA DEL SISTEMA
// ============================================================================

const TRAY_LABELS = {
    es: { open: 'Abrir Ember Launcher', quit: 'Salir' },
    en: { open: 'Open Ember Launcher', quit: 'Quit' },
    fr: { open: 'Ouvrir Ember Launcher', quit: 'Quitter' },
    de: { open: 'Ember Launcher öffnen', quit: 'Beenden' },
    pt: { open: 'Abrir Ember Launcher', quit: 'Sair' }
};

function trayLabels() {
    const lang = loadConfig().language;
    return TRAY_LABELS[lang] || TRAY_LABELS.es;
}

// Cerrar la ventana ya no cierra el launcher del todo: se queda en la
// bandeja del sistema para no perder la sesión ni la partida en curso por un
// clic accidental en la X. Solo se cierra de verdad desde el menú de la
// bandeja o al instalar una actualización.
async function setupTray() {
    let icon = nativeImage.createFromPath(APP_ICON_PATH);
    if (icon.isEmpty()) {
        try {
            icon = await app.getFileIcon(process.execPath);
        } catch (err) {
            icon = nativeImage.createEmpty();
        }
    }

    tray = new Tray(icon);
    tray.setToolTip('Ember Launcher');

    const rebuildMenu = () => {
        const labels = trayLabels();
        tray.setContextMenu(Menu.buildFromTemplate([
            { label: labels.open, click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
            { type: 'separator' },
            { label: labels.quit, click: () => { isQuitting = true; app.quit(); } }
        ]));
    };
    rebuildMenu();

    tray.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });

    // El idioma puede cambiar mientras la app está abierta; el menú se
    // reconstruye la próxima vez que se abre para reflejarlo.
    tray.on('right-click', rebuildMenu);
}

// ============================================================================
// NOTIFICACIONES NATIVAS DE WINDOWS
// ============================================================================

// Avisan aunque el launcher esté minimizado o detrás de otras ventanas
// (actualización lista para instalar, juego cerrado con error).
function notify(title, body) {
    if (!Notification.isSupported()) return;
    new Notification({ title, body }).show();
}

// ============================================================================
// AUTO-ACTUALIZACIÓN (electron-updater + GitHub Releases)
// ============================================================================

// Comprueba actualizaciones publicadas como GitHub Release del repo
// configurado en package.json ("build.publish"). Solo tiene sentido en la app
// empaquetada: en desarrollo (electron .) no hay artefacto publicado que
// comprobar y autoUpdater lanzaría un error.
//
// A diferencia de antes, NO se descarga automáticamente al detectar una
// versión nueva: se avisa al renderer para que muestre un popup y el usuario
// decida si quiere descargarla ahora o más tarde. Como la comprobación se
// repite cada vez que se abre la app (y no se recuerda la respuesta anterior),
// si el usuario elige "más tarde" simplemente volverá a preguntarse la
// próxima vez que abra el launcher.
function setupAutoUpdates() {
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    const send = (type, extra) => {
        if (mainWindow) mainWindow.webContents.send('update-status', { type, ...extra });
    };

    autoUpdater.on('update-available', (info) => {
        // info.releaseNotes puede venir como string (un solo release) o como
        // array de {version, note} (varios releases desde la instalada); lo
        // normalizamos siempre a texto plano para que el renderer no tenga
        // que preocuparse por el formato.
        let releaseNotes = '';
        if (typeof info.releaseNotes === 'string') {
            releaseNotes = info.releaseNotes;
        } else if (Array.isArray(info.releaseNotes)) {
            releaseNotes = info.releaseNotes.map((n) => n.note || '').join('\n\n');
        }
        releaseNotes = releaseNotes.replace(/<[^>]+>/g, '').trim();
        send('available', { version: info.version, releaseNotes });
    });
    autoUpdater.on('update-not-available', () => send('not-available'));
    autoUpdater.on('download-progress', (progress) => send('downloading', { percent: Math.round(progress.percent) }));
    autoUpdater.on('update-downloaded', (info) => {
        send('downloaded', { version: info.version });
        notify('Ember Launcher', `La actualización v${info.version} está lista. Reinicia el launcher para instalarla.`);
    });
    autoUpdater.on('error', (err) => {
        const message = err && err.message ? err.message : String(err);
        console.warn('[WARN] Error comprobando actualizaciones:', message);
        send('error', { message });
    });

    autoUpdater.checkForUpdates().catch((err) => {
        console.warn('[WARN] No se pudo comprobar actualizaciones:', err && err.message ? err.message : err);
    });
}

ipcMain.on('download-update', () => autoUpdater.downloadUpdate());
ipcMain.on('restart-and-update', () => autoUpdater.quitAndInstall());

ipcMain.handle('get-app-version', () => app.getVersion());

// RAM física total del sistema, para avisar en la UI si el usuario asigna
// más memoria de la que realmente hay (eso causa crashes confusos de Java).
ipcMain.handle('get-system-memory', () => os.totalmem());

// Render 3D del skin para la cabecera de cuenta. Se pide desde el proceso
// principal (no como <img src> directo en el renderer) por dos motivos:
// 1) Visage exige un User-Agent identificable y rechaza cualquier UA de
//    navegador (a un <img> normal no se le puede poner cabecera propia).
// 2) Así podemos probar Crafatar primero y caer a Visage si el primero
//    falla (p.ej. si Crafatar está caído), sin que el renderer tenga que
//    saber nada de estos detalles.
async function fetchImageAsDataUri(url, extraHeaders) {
    const res = await fetchWithTimeout(url, { headers: extraHeaders }, 8000);
    if (!res.ok) throw new Error(`estado ${res.status}`);
    const contentType = res.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString('base64')}`;
}

ipcMain.handle('get-skin-render', async (event, { uuid }) => {
    if (!uuid) return null;
    try {
        return await fetchImageAsDataUri(`https://crafatar.com/renders/body/${uuid}?scale=6&overlay`);
    } catch (err) {
        console.warn('[WARN] Crafatar no disponible, probando con Visage:', err.message);
    }
    try {
        return await fetchImageAsDataUri(`https://visage.surgeplay.com/full/256/${uuid}`, {
            'User-Agent': 'EmberLauncher/1.3.0 (+https://github.com/HCuadrado428/Launcher)'
        });
    } catch (err) {
        console.warn('[WARN] Visage tampoco disponible:', err.message);
        return null;
    }
});

// Estado del backend (arriba/dormido/caído), para el puntito de estado en la
// pantalla de modpacks. Usa /health, que no necesita sesión.
ipcMain.handle('check-backend-status', async () => {
    try {
        const res = await fetchWithTimeout(`${getBackendUrl()}/health`, {}, 8000);
        return { ok: res.ok };
    } catch (err) {
        return { ok: false };
    }
});

// Comprobación manual (botón "Buscar actualizaciones" en la UI). Reusa los
// mismos eventos de arriba para avisar al renderer del resultado.
ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) {
        return { ok: false, message: 'La comprobación de actualizaciones solo funciona en la app instalada, no en modo desarrollo.' };
    }
    try {
        await autoUpdater.checkForUpdates();
        return { ok: true };
    } catch (err) {
        return { ok: false, message: err && err.message ? err.message : String(err) };
    }
});

// ============================================================================
// VENTANA Y DEEP LINKS (milauncher://invite/TOKEN)
// ============================================================================

function handleDeepLink(url) {
    const match = /^milauncher:\/\/invite\/(.+)$/.exec(url || '');
    if (!match) return;
    const token = match[1];
    if (mainWindow && !mainWindow.webContents.isLoading()) {
        mainWindow.webContents.send('invite-received', { token });
        mainWindow.focus();
    } else {
        pendingDeepLink = token;
    }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', (event, argv) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        const url = argv.find(arg => arg.startsWith('milauncher://'));
        if (url) handleDeepLink(url);
    });

    app.on('open-url', (event, url) => {
        event.preventDefault();
        handleDeepLink(url);
    });

    // Pantalla de carga: tapa el parpadeo en blanco/negro que da Electron los
    // primeros instantes mientras arranca el proceso de renderizado, y se
    // cierra sola en cuanto la ventana principal ya tiene su primer frame
    // pintado. Se le da un mínimo de medio segundo para que no sea un
    // parpadeo aún más raro en máquinas rápidas donde todo carga al instante.
    function createSplashWindow() {
        const splash = new BrowserWindow({
            width: 320,
            height: 360,
            frame: false,
            transparent: true,
            resizable: false,
            movable: false,
            skipTaskbar: true,
            alwaysOnTop: true,
            icon: APP_ICON_PATH,
            webPreferences: { contextIsolation: true }
        });
        splash.loadFile('splash.html');
        return splash;
    }

    function createWindow() {
        const splashWindow = createSplashWindow();
        const splashMinDuration = new Promise((resolve) => setTimeout(resolve, 500));

        mainWindow = new BrowserWindow({
            width: 900,
            height: 700,
            backgroundColor: '#12181f',
            icon: APP_ICON_PATH,
            show: false,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                nodeIntegration: false,
                contextIsolation: true
            }
        });
        windowState.setMainWindow(mainWindow);
        mainWindow.loadFile('index.html');

        mainWindow.once('ready-to-show', () => {
            splashMinDuration.then(() => {
                if (!splashWindow.isDestroyed()) splashWindow.close();
                mainWindow.show();
            });
        });

        mainWindow.webContents.on('did-finish-load', () => {
            if (pendingDeepLink) {
                mainWindow.webContents.send('invite-received', { token: pendingDeepLink });
                pendingDeepLink = null;
            }
        });

        mainWindow.on('close', (event) => {
            if (!isQuitting) {
                event.preventDefault();
                mainWindow.hide();
            }
        });
    }

    app.whenReady().then(() => {
        Menu.setApplicationMenu(null);

        // Registro del protocolo milauncher:// para los links de invitación.
        // En desarrollo (ejecutando "electron .") hace falta pasar la ruta
        // del proyecto; en la app empaquetada no.
        if (process.defaultApp) {
            if (process.argv.length >= 2) {
                app.setAsDefaultProtocolClient('milauncher', process.execPath, [path.resolve(process.argv[1])]);
            }
        } else {
            app.setAsDefaultProtocolClient('milauncher');
        }

        createWindow();
        setupTray();
        setupAutoUpdates();

        // En Windows/Linux, si la app se abrió directamente desde un link,
        // el link viene como argumento en process.argv.
        const initialUrl = process.argv.find(arg => arg.startsWith('milauncher://'));
        if (initialUrl) handleDeepLink(initialUrl);
    });

    app.on('before-quit', () => {
        isQuitting = true;
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}

// ============================================================================
// EVENTOS DEL LANZADOR DE MINECRAFT
// ============================================================================

launcher.on('debug', (e) => console.log(`[DEBUG] ${e}`));
launcher.on('data', (e) => {
    console.log(`[GAME] ${e}`);
    currentGameLogLines.push(String(e));
    if (mainWindow) mainWindow.webContents.send('game-log', String(e));
});

launcher.on('progress', (e) => {
    if (mainWindow) mainWindow.webContents.send('game-progress', e);
});
launcher.on('download-status', (e) => {
    if (mainWindow) mainWindow.webContents.send('game-progress', e);
});

launcher.on('close', (code) => {
    console.log(`[CLOSE] El juego se cerró con código ${code}`);
    gameProcess = null;

    if (playSessionStart) {
        const minutesPlayed = (Date.now() - playSessionStart) / 60000;
        const key = playSessionTargetKey || 'vanilla';
        const cfg = loadConfig();
        const playtime = { ...(cfg.playtime || {}) };
        playtime[key] = (playtime[key] || 0) + minutesPlayed;
        saveConfig({ playtime });
        playSessionStart = null;
        playSessionTargetKey = null;
    }

    if (mainWindow) {
        mainWindow.webContents.send('game-status', { type: 'closed', code });
    }
    if (code !== 0) {
        persistCrashLog(code);
        notify('Ember Launcher', `Minecraft se cerró inesperadamente (código ${code}). Revisa la consola del juego para más detalles.`);
    }
});

// ============================================================================
// IPC: CONFIG / CUENTAS
// ============================================================================

// La primera vez que se abre el launcher todavía no hay idioma guardado; en
// vez de arrancar siempre en español, probamos a adivinarlo del idioma del
// sistema operativo (si está entre los que soportamos).
const SUPPORTED_LANGUAGES = ['es', 'en', 'fr', 'de', 'pt'];

ipcMain.handle('get-config', () => {
    const cfg = loadConfig();
    if (!cfg.language) {
        const systemLang = (app.getLocale() || 'es').slice(0, 2).toLowerCase();
        const chosen = SUPPORTED_LANGUAGES.includes(systemLang) ? systemLang : 'es';
        return { ...saveConfig({ language: chosen }), account: cfg.account ? toPublicAccount(cfg.account) : cfg.account };
    }
    // cfg.account trae el token/auth interno (necesario para las llamadas
    // del propio main.js); el renderer solo necesita la versión pública, la
    // misma que devuelven login/switch-account, para que "premium" salga
    // siempre calculado igual sin importar por qué camino se cargó la cuenta.
    return { ...cfg, account: cfg.account ? toPublicAccount(cfg.account) : cfg.account };
});

// RAM y ruta de Java guardadas por modpack (o "vanilla" si no hay ninguno
// activo), en vez de un único valor global. Si el modpack pedido no tiene
// ajustes propios todavía, se cae al valor global (compatibilidad con
// configuraciones guardadas antes de que existiera esto).
ipcMain.handle('get-target-settings', (event, { modpackId }) => {
    const cfg = loadConfig();
    const key = modpackId || 'vanilla';
    const saved = (cfg.perModpackSettings && cfg.perModpackSettings[key]) || {};
    return {
        javaPath: saved.javaPath || cfg.javaPath || '',
        memory: saved.memory || cfg.memory || null,
        customArgs: saved.customArgs || ''
    };
});

ipcMain.handle('get-backend-url', () => getBackendUrl());
ipcMain.handle('set-backend-url', (event, url) => saveConfig({ backendUrl: url }));

// Añade/actualiza una cuenta en la lista guardada, identificándola por su
// "id" (estable entre sesiones: el uuid de Xbox para Microsoft, el nombre en
// minúsculas para offline). Repetir login con la misma identidad actualiza
// la entrada existente en vez de duplicarla.
function upsertAccount(accounts, account) {
    return [...accounts.filter((a) => a.id !== account.id), account];
}

// Lo que ve el renderer de cada cuenta guardada: nunca el token/auth interno,
// solo lo necesario para pintar la lista y poder pedir el cambio por id.
// "premium" viene de la sesión con el backend (true para Microsoft, false
// para offline) y decide si la UI deja compartir/generar invitaciones.
function toPublicAccount(account) {
    // Las sesiones guardadas antes de que existiera "premium" (cualquier
    // cuenta Microsoft verificada antes de este cambio) no tienen ese campo.
    // Si lo tratáramos como "falta = no premium" se ocultaría el botón de
    // invitar a cuentas Microsoft legítimas hasta que volvieran a loguearse.
    // Solo una cuenta offline puede tener premium explícitamente en false
    // (así lo devuelve /auth/verify-offline); si no está presente, se asume
    // premium salvo que la sesión diga expresamente lo contrario.
    const premium = account.session
        ? account.session.premium !== false
        : account.type === 'microsoft';
    return {
        id: account.id,
        type: account.type,
        username: account.username,
        uuid: account.uuid || null,
        premium
    };
}

ipcMain.handle('login-offline', async (event, username) => {
    const name = (username || 'Jugador').trim() || 'Jugador';
    const uuid = offlineUuidFromUsername(name);
    const account = { id: `offline:${name.toLowerCase()}`, type: 'offline', username: name, uuid };

    // Las cuentas offline ahora sí pueden crear y unirse a modpacks: el
    // backend las registra como "no premium". Lo único que no pueden hacer
    // es compartir/generar invitaciones (ver requirePremium en el backend).
    // Si el backend no está disponible no bloqueamos el login local, igual
    // que en Microsoft: simplemente no habrá modpacks hasta que se pueda
    // contactar con el servidor.
    let session = null;
    try {
        const verified = await verifyOfflineSessionWithBackend(name);
        session = { token: verified.token, uuid: verified.uuid, username: verified.username, premium: false };
    } catch (err) {
        console.warn('[WARN] No se pudo registrar la cuenta offline con el backend de modpacks:', err.message);
    }
    account.session = session;

    const cfg = loadConfig();
    const accounts = upsertAccount(cfg.accounts || [], account);
    saveConfig({ account, session, activeModpack: null, accounts, activeAccountId: account.id });
    return toPublicAccount(account);
});

ipcMain.handle('login-microsoft', async () => {
    if (!Auth) {
        return {
            success: false,
            message: 'Falta instalar la librería "msmc". Ejecuta "npm install" en la carpeta del proyecto y vuelve a intentarlo.'
        };
    }

    try {
        const authManager = new Auth('select_account');
        const xboxManager = await authManager.launch('electron');
        const token = await xboxManager.getMinecraft();
        const mclcAuth = token.mclc();

        const account = {
            id: `ms:${mclcAuth.uuid}`,
            type: 'microsoft',
            username: mclcAuth.name,
            uuid: mclcAuth.uuid,
            auth: mclcAuth
        };

        // Además de guardar la cuenta para jugar, verificamos la sesión
        // contra el backend de modpacks para poder crear/unirnos a modpacks.
        // Esa sesión se guarda también dentro de la cuenta para poder
        // restaurarla sin volver a loguear si el usuario cambia de cuenta y
        // luego vuelve a esta.
        let session = null;
        try {
            const verified = await verifySessionWithBackend(mclcAuth.access_token);
            session = { token: verified.token, uuid: verified.uuid, username: verified.username, premium: !!verified.premium };
        } catch (err) {
            console.warn('[WARN] No se pudo verificar la sesión con el backend de modpacks:', err.message);
            // No bloqueamos el login normal por esto: el usuario puede jugar
            // igualmente, solo no podrá usar modpacks hasta que el backend
            // esté disponible.
        }
        account.session = session;

        const cfg = loadConfig();
        const accounts = upsertAccount(cfg.accounts || [], { ...account, session });
        saveConfig({ account, session, accounts, activeAccountId: account.id });

        return { success: true, account: toPublicAccount(account) };
    } catch (err) {
        console.error('[ERROR] Login con Microsoft fallido:', err);
        return {
            success: false,
            message: err && err.message ? err.message : 'No se pudo completar el login con Microsoft.'
        };
    }
});

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

ipcMain.handle('logout', async () => {
    const cfg = loadConfig();
    if (cfg.session && cfg.session.token) await bestEffortBackendLogout(cfg.session.token);
    delete cfg.account;
    cfg.session = null;
    cfg.activeModpack = null;
    cfg.activeAccountId = null;
    saveConfig(cfg);
    return true;
});

ipcMain.handle('get-accounts', () => {
    const cfg = loadConfig();
    return (cfg.accounts || []).map(toPublicAccount);
});

ipcMain.handle('switch-account', (event, { id }) => {
    const cfg = loadConfig();
    const found = (cfg.accounts || []).find((a) => a.id === id);
    if (!found) throw new Error('Esa cuenta ya no está guardada. Vuelve a iniciar sesión.');

    const account = { id: found.id, type: found.type, username: found.username, uuid: found.uuid, auth: found.auth, session: found.session || null };
    // Cambiar de cuenta implica soltar el modpack activo (los modpacks están
    // ligados a la identidad de quien los creó/tiene acceso). No cerramos la
    // sesión de la cuenta que se deja de usar: así se puede volver a ella sin
    // tener que volver a iniciar sesión.
    saveConfig({ account, session: found.session || null, activeModpack: null, activeAccountId: found.id });
    return toPublicAccount(account);
});

ipcMain.handle('remove-account', async (event, { id }) => {
    const cfg = loadConfig();
    const accounts = (cfg.accounts || []).filter((a) => a.id !== id);
    const patch = { accounts };
    const wasActive = cfg.activeAccountId === id;
    if (wasActive) {
        if (cfg.session && cfg.session.token) await bestEffortBackendLogout(cfg.session.token);
        patch.account = null;
        patch.session = null;
        patch.activeAccountId = null;
        patch.activeModpack = null;
    }
    saveConfig(patch);
    return { removedActive: wasActive };
});

ipcMain.handle('select-java-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecciona java.exe',
        properties: ['openFile'],
        filters: [{ name: 'Java', extensions: ['exe'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

ipcMain.handle('auto-detect-java', () => findNewestJava());

ipcMain.handle('get-latest-mc-version', async () => (await getMinecraftVersionToLaunch()).version);
ipcMain.handle('get-release-versions', () => getReleaseVersionsToShow());

ipcMain.handle('set-language', (event, lang) => saveConfig({ language: lang }));

ipcMain.handle('set-color-theme', (event, theme) => saveConfig({ colorTheme: theme }));

// Elección local del jugador sobre qué mods "opcionales" de un modpack
// quiere tener instalados (ver el filtro en syncModpackImpl). Ausencia de
// entrada = incluido (comportamiento por defecto, igual que antes de que
// existiera esta opción).
ipcMain.handle('get-optional-mod-choices', (event, { id }) => {
    const cfg = loadConfig();
    return (cfg.optionalModChoices && cfg.optionalModChoices[id]) || {};
});

ipcMain.handle('set-optional-mod-choice', (event, { id, modId, included }) => {
    const cfg = loadConfig();
    const optionalModChoices = { ...(cfg.optionalModChoices || {}) };
    optionalModChoices[id] = { ...(optionalModChoices[id] || {}), [modId]: included };
    saveConfig({ optionalModChoices });
    return optionalModChoices[id];
});

// Minutos totales jugados con este modpack (o "vanilla"), acumulados en
// local cada vez que se cierra una partida. Es solo un contador cosmético,
// no se sincroniza con el servidor.
ipcMain.handle('get-playtime', (event, { modpackId }) => {
    const cfg = loadConfig();
    const key = modpackId || 'vanilla';
    return (cfg.playtime && cfg.playtime[key]) || 0;
});

// La búsqueda/descarga de CurseForge todavía no está activa (ver sección de
// detección de instancias locales): sus términos de uso prohíben cachear
// datos o hacer de proxy, así que cuando se implemente tendrá que llamar a
// su API directamente desde aquí con la key de cada usuario, nunca a través
// del backend propio. De momento solo guardamos la key para cuando llegue
// ese momento.
ipcMain.handle('set-curseforge-api-key', (event, apiKey) => saveConfig({ curseforgeApiKey: apiKey || '' }));

// ============================================================================
// IPC: LISTAS DE VERSIONES DE LOADER (para el selector al crear un modpack)
// ============================================================================

ipcMain.handle('get-forge-versions', (event, { mcVersion }) => getForgeVersionsForMc(mcVersion));
ipcMain.handle('get-fabric-versions', (event, { mcVersion }) => getFabricVersionsForMc(mcVersion));

// ============================================================================
// IPC: MODPACKS
// ============================================================================

ipcMain.handle('modpacks-create', async (event, { name, mcVersion, loader, loaderVersion }) => {
    return apiRequest('/api/modpacks', {
        method: 'POST',
        body: { name, mc_version: mcVersion, loader, loader_version: loaderVersion }
    });
});

ipcMain.handle('modpacks-delete', async (event, { id }) => {
    return apiRequest(`/api/modpacks/${id}`, { method: 'DELETE' });
});

ipcMain.handle('modpacks-mine', async () => {
    return apiRequest('/api/modpacks/mine');
});

ipcMain.handle('modpacks-manifest', async (event, { id }) => {
    return apiRequest(`/api/modpacks/${id}/manifest`);
});

// Comprobación rápida y solo local (sin tocar el servidor) de si la
// instalación de un modpack parece rota: ¿existen de verdad en disco los
// archivos que nuestra propia meta dice que deberían estar? No comprueba el
// contenido (para eso está "Verificar archivos", más lento a propósito):
// es solo la señal barata que decide si tiene sentido ofrecer "Reparar
// instalación" o mejor no molestar con ese botón si no hace falta.
function checkLocalInstanceHealth(modpackId) {
    const dir = instanceDir(modpackId);
    if (!fs.existsSync(dir)) return { synced: false, healthy: true };

    const meta = loadInstanceMeta(modpackId);

    if (meta.loader && meta.loader !== 'vanilla') {
        if (!meta.loader_version_id) return { synced: true, healthy: false };
        const versionJsonPath = path.join(dir, 'versions', meta.loader_version_id, `${meta.loader_version_id}.json`);
        if (!fs.existsSync(versionJsonPath)) return { synced: true, healthy: false };
    }

    for (const mod of meta.mods || []) {
        const filePath = path.join(instanceDirForModType(modpackId, mod), mod.filename);
        if (!fs.existsSync(filePath)) return { synced: true, healthy: false };
    }

    return { synced: true, healthy: true };
}

ipcMain.handle('modpacks-check-health', (event, { id }) => checkLocalInstanceHealth(id));

ipcMain.handle('modpacks-add-mod', async (event, { id, type }) => {
    const modType = type === 'resourcepack' ? 'resourcepack' : 'mod';
    const result = await dialog.showOpenDialog(mainWindow, {
        title: modType === 'resourcepack' ? 'Selecciona uno o varios resource packs (.zip)' : 'Selecciona uno o varios mods (.jar)',
        properties: ['openFile', 'multiSelections'],
        filters: [{
            name: modType === 'resourcepack' ? 'Resource packs de Minecraft' : 'Mods de Minecraft',
            extensions: [modType === 'resourcepack' ? 'zip' : 'jar']
        }]
    });
    if (result.canceled || result.filePaths.length === 0) return { cancelled: true };

    const cfg = loadConfig();
    const uploaded = [];
    for (const filePath of result.filePaths) {
        const fileBuffer = await fs.promises.readFile(filePath);
        const form = new FormData();
        // "type" tiene que ir antes que "mod": multer procesa el multipart en
        // orden y solo ve los campos ya leídos cuando decide si el archivo
        // pasa el filtro de extensión.
        form.append('type', modType);
        form.append('mod', new Blob([fileBuffer]), path.basename(filePath));

        const res = await fetch(`${getBackendUrl()}/api/modpacks/${id}/mods`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cfg.session.token}` },
            body: form
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `No se pudo subir ${path.basename(filePath)}.`);
        uploaded.push(data);
    }
    return { cancelled: false, uploaded };
});

ipcMain.handle('modpacks-remove-mod', async (event, { id, modId }) => {
    return apiRequest(`/api/modpacks/${id}/mods/${modId}`, { method: 'DELETE' });
});

ipcMain.handle('modpacks-check-mod-update', async (event, { id, modId }) => {
    return apiRequest(`/api/modpacks/${id}/mods/${modId}/check-update`);
});

ipcMain.handle('search-modrinth', async (event, { query, mcVersion, loader, projectType }) => {
    return searchModrinth(query, mcVersion, loader, projectType);
});

ipcMain.handle('add-mod-from-modrinth', async (event, { id, projectId, mcVersion, loader, projectType }) => {
    const version = await resolveBestModrinthVersion(projectId, mcVersion, loader, projectType);
    if (!version) throw new Error('No hay ninguna versión de este mod compatible con la versión de Minecraft/loader del modpack.');
    return apiRequest(`/api/modpacks/${id}/mods/from-modrinth`, {
        method: 'POST',
        body: { project_id: projectId, version_id: version.id, type: projectType }
    });
});

ipcMain.handle('scan-local-modpacks', async () => {
    const curseforge = findCurseForgeInstances();
    const modrinth = await findModrinthInstances();
    lastScannedModrinthInstances = modrinth;
    // No mandamos resolvedMods (puede ser una lista larga) al renderer, solo
    // lo que hace falta para mostrar la lista; se recupera por "path" al
    // importar.
    const modrinthForUi = modrinth.map(({ resolvedMods, ...rest }) => rest);
    return [...curseforge, ...modrinthForUi];
});

ipcMain.handle('import-local-modpack', async (event, { instancePath }) => {
    const instance = lastScannedModrinthInstances.find((i) => i.path === instancePath);
    if (!instance) throw new Error('No se encontró esa instancia. Vuelve a escanear.');

    const created = await apiRequest('/api/modpacks', {
        method: 'POST',
        body: { name: instance.name, mc_version: instance.mcVersion, loader: instance.loader, loader_version: '' }
    });

    let imported = 0;
    let skipped = 0;
    const total = instance.resolvedMods.length;
    for (const mod of instance.resolvedMods) {
        try {
            await apiRequest(`/api/modpacks/${created.id}/mods/from-modrinth`, {
                method: 'POST',
                body: { project_id: mod.projectId, version_id: mod.versionId, type: 'mod' }
            });
            imported++;
        } catch (err) {
            skipped++;
        }
        if (mainWindow) {
            const done = imported + skipped;
            mainWindow.webContents.send('modpack-sync-progress', {
                label: `Importando mods... (${done}/${total})`,
                percent: total > 0 ? Math.round((done / total) * 100) : 100,
                modpackId: created.id
            });
        }
    }

    const unresolvedCount = instance.modCount - instance.resolvedCount;
    return { modpack: created, imported, skipped, unresolvedCount };
});

ipcMain.handle('modpacks-create-invite', async (event, { id, maxUses, expiresHours }) => {
    return apiRequest(`/api/modpacks/${id}/invite`, {
        method: 'POST',
        body: { max_uses: maxUses || null, expires_in_hours: expiresHours || null }
    });
});

ipcMain.handle('modpacks-list-invites', async (event, { id }) => {
    return apiRequest(`/api/modpacks/${id}/invites`);
});

ipcMain.handle('modpacks-revoke-invite', async (event, { id, token }) => {
    return apiRequest(`/api/modpacks/${id}/invites/${token}`, { method: 'DELETE' });
});

ipcMain.handle('modpacks-list-access', async (event, { id }) => {
    return apiRequest(`/api/modpacks/${id}/access`);
});

ipcMain.handle('modpacks-revoke-access', async (event, { id, uuid }) => {
    return apiRequest(`/api/modpacks/${id}/access/${uuid}`, { method: 'DELETE' });
});

ipcMain.handle('modpacks-list-versions', async (event, { id }) => {
    return apiRequest(`/api/modpacks/${id}/versions`);
});

ipcMain.handle('modpacks-restore-version', async (event, { id, versionId }) => {
    return apiRequest(`/api/modpacks/${id}/versions/${versionId}/restore`, { method: 'POST' });
});

ipcMain.handle('get-storage-usage', async () => {
    return apiRequest('/api/modpacks/storage');
});

ipcMain.handle('modpacks-leave', async (event, { id }) => {
    return apiRequest(`/api/modpacks/${id}/leave`, { method: 'POST' });
});

ipcMain.handle('modpacks-redeem-invite', async (event, { token }) => {
    return apiRequest(`/api/invites/${token}/redeem`, { method: 'POST' });
});

ipcMain.handle('modpacks-sync', async (event, { id }) => {
    return syncModpack(id);
});

// "Reparar instalación": borra solo lo que gestiona el launcher (mods,
// resourcepacks del modpack, loader instalado y su meta de sincronización) y
// vuelve a sincronizar desde cero. Deliberadamente NO toca saves/, config/,
// options.txt, screenshots/ ni ningún otro dato del jugador — instanceDir()
// es la misma carpeta que se usa como "root" al lanzar el juego, así que
// borrarla entera (como se hacía antes) se cargaba los mundos guardados.
const REPAIR_WIPE_SUBPATHS = ['mods', 'resourcepacks', 'versions', 'libraries'];
async function wipeRepairableInstanceData(modpackId) {
    const dir = instanceDir(modpackId);
    for (const sub of REPAIR_WIPE_SUBPATHS) {
        await fs.promises.rm(path.join(dir, sub), { recursive: true, force: true });
    }
    await fs.promises.rm(instanceMetaPath(modpackId), { force: true });
}
ipcMain.handle('modpacks-repair', async (event, { id }) => {
    await wipeRepairableInstanceData(id);
    return syncModpack(id);
});

// "Verificar archivos": más ligero que "Reparar". No toca el loader ni borra
// nada de entrada; recalcula el sha1 real de cada mod ya descargado (no el
// que se recordó en su día, por si el archivo se corrompió o alguien lo tocó
// a mano) y solo vuelve a descargar los que de verdad no coinciden.
ipcMain.handle('modpacks-verify-files', async (event, { id }) => {
    const localMeta = loadInstanceMeta(id);
    const mods = localMeta.mods || [];
    const total = mods.length;
    let checked = 0;
    let fixed = 0;

    // El hash de cada archivo es lectura local (barata de paralelizar de
    // verdad); antes se comprobaba uno a uno, lo que en un modpack con
    // muchos mods hacía que "Verificar archivos" tardase mucho más de lo
    // necesario para lo poco que cuesta cada comprobación individual.
    await runWithConcurrencyLimit(mods, 6, async (mod) => {
        const filePath = path.join(instanceDirForModType(id, mod), mod.filename);
        let actualSha1 = null;
        if (fs.existsSync(filePath)) {
            try { actualSha1 = await sha1File(filePath); } catch (err) { actualSha1 = null; }
        }

        checked++;
        const percent = total > 0 ? Math.round((checked / total) * 100) : 100;
        if (actualSha1 === mod.sha1) {
            if (mainWindow) {
                mainWindow.webContents.send('modpack-sync-progress', { label: `Comprobando ${mod.filename}...`, percent, modpackId: id });
            }
            return;
        }

        if (mainWindow) {
            mainWindow.webContents.send('modpack-sync-progress', { label: `Corrigiendo ${mod.filename}...`, percent, modpackId: id });
        }
        await downloadModFile(id, mod, filePath);
        const redownloadedSha1 = await sha1File(filePath);
        if (redownloadedSha1 !== mod.sha1) {
            throw new Error(`El archivo ${mod.filename} se volvió a descargar pero sigue sin coincidir con el original. Vuelve a intentarlo.`);
        }
        fixed++;
    });

    return { checked, fixed };
});

// Exporta los mods y resource packs ya descargados de un modpack a un .zip
// local, para tener copia de seguridad sin depender del servidor. No incluye
// las librerías/assets de Forge o Fabric: esos se pueden volver a instalar en
// cualquier momento y ocuparían muchísimo más que los propios mods.
function addDirToZip(zipfile, dir, base) {
    if (!fs.existsSync(dir)) return 0;
    let count = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = `${base}/${entry.name}`;
        if (entry.isDirectory()) {
            count += addDirToZip(zipfile, full, rel);
        } else {
            zipfile.addFile(full, rel);
            count++;
        }
    }
    return count;
}

ipcMain.handle('modpacks-export', async (event, { id, name }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Exportar modpack',
        defaultPath: `${(name || 'modpack').replace(/[\\/:*?"<>|]/g, '_')}.zip`,
        filters: [{ name: 'Archivo zip', extensions: ['zip'] }]
    });
    if (result.canceled || !result.filePath) return { cancelled: true };

    const zipfile = new yazl.ZipFile();
    const fileCount = addDirToZip(zipfile, instanceModsDir(id), 'mods')
        + addDirToZip(zipfile, instanceResourcePacksDir(id), 'resourcepacks');

    await new Promise((resolve, reject) => {
        zipfile.outputStream.pipe(fs.createWriteStream(result.filePath))
            .on('close', resolve)
            .on('error', reject);
        zipfile.end();
    });

    return { cancelled: false, filePath: result.filePath, fileCount };
});

const COVER_MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const COVER_MAX_BYTES = 250 * 1024;

ipcMain.handle('modpacks-set-cover', async (event, { id }) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Elegir portada del modpack',
        properties: ['openFile'],
        filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return { cancelled: true };

    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    const mime = COVER_MIME_BY_EXT[ext];
    if (!mime) throw new Error('Formato de imagen no soportado.');

    const stat = await fs.promises.stat(filePath);
    if (stat.size > COVER_MAX_BYTES) {
        throw new Error(`La imagen pesa ${formatBytesMain(stat.size)}; usa una de menos de ${formatBytesMain(COVER_MAX_BYTES)}.`);
    }

    const buffer = await fs.promises.readFile(filePath);
    const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;
    await apiRequest(`/api/modpacks/${id}/cover`, { method: 'PUT', body: { cover_image: dataUri } });
    return { cancelled: false, coverImage: dataUri };
});

ipcMain.handle('modpacks-select', async (event, { id, name, mcVersion, loader, loaderVersion }) => {
    saveConfig({
        activeModpack: id
            ? { id, name, mc_version: mcVersion, loader: loader || 'vanilla', loader_version: loaderVersion || '' }
            : null
    });
    return true;
});

// ============================================================================
// IPC: LANZAR / DETENER EL JUEGO
// ============================================================================

ipcMain.on('launch-game', async (event, { javaPath, memory, customArgs }) => {
    const cfg = loadConfig();
    const account = cfg.account;

    if (!account) {
        mainWindow.webContents.send('game-status', {
            type: 'error',
            message: 'No hay ninguna cuenta seleccionada. Inicia sesión primero.'
        });
        return;
    }

    let finalJavaPath = javaPath && javaPath.trim() ? javaPath.trim() : findNewestJava();
    if (!finalJavaPath) {
        mainWindow.webContents.send('game-status', {
            type: 'error',
            message: 'No se encontró ninguna instalación de Java en este sistema. Instala Java o indica la ruta manualmente.'
        });
        return;
    }

    const finalCustomArgs = typeof customArgs === 'string' ? customArgs.trim() : '';

    const targetKey = (cfg.activeModpack && cfg.activeModpack.id) || 'vanilla';
    const perModpackSettings = { ...(cfg.perModpackSettings || {}) };
    perModpackSettings[targetKey] = { javaPath: finalJavaPath, memory, customArgs: finalCustomArgs };
    saveConfig({ javaPath: finalJavaPath, memory, perModpackSettings });

    const authorization = account.type === 'microsoft'
        ? account.auth
        : Authenticator.getAuth(account.username);

    const activeModpack = cfg.activeModpack;
    let versionNumber;
    let root;
    let loaderVersionId = null;

    if (activeModpack) {
        // Jugando con un modpack: sincronizamos siempre antes de lanzar (esto
        // descarga/borra mods, instala Forge/Fabric si hace falta, y de paso
        // detecta si el modpack fue eliminado por el creador).
        let synced;
        try {
            synced = await syncModpack(activeModpack.id);
        } catch (err) {
            if (err.status === 404 || err.status === 403) {
                // No borramos la carpeta de la instancia: puede contener mundos
                // guardados del jugador que quiera conservar aunque pierda acceso
                // al modpack (por ejemplo, si el dueño lo vuelve a compartir).
                saveConfig({ activeModpack: null });
                mainWindow.webContents.send('game-status', {
                    type: 'modpack-removed',
                    message: `El modpack "${activeModpack.name}" ya no está disponible (fue eliminado o perdiste el acceso). Has vuelto a Minecraft vanilla; pulsa "Iniciar Juego" de nuevo si quieres continuar.`
                });
                return;
            }
            mainWindow.webContents.send('game-status', {
                type: 'error',
                message: `No se pudo sincronizar el modpack: ${err.message}`
            });
            return;
        }

        versionNumber = synced.mc_version;
        loaderVersionId = synced.loader_version_id;
        root = instanceDir(activeModpack.id);
        mainWindow.webContents.send('game-status', { type: 'version-selected', version: versionNumber });
    } else {
        const resolved = await getMinecraftVersionToLaunch();
        versionNumber = resolved.version;
        root = VANILLA_ROOT;
        if (resolved.fallback) {
            mainWindow.webContents.send('game-status', {
                type: 'version-fallback-warning',
                message: `No se pudo comprobar cuál es la última versión de Minecraft (¿sin conexión?). Se va a usar la ${versionNumber}${getInstalledVanillaVersions().length ? ' (la última que tienes instalada)' : ''}.`
            });
        }
        mainWindow.webContents.send('game-status', { type: 'version-selected', version: versionNumber });
    }

    const requiredJavaMajor = requiredJavaMajorFor(versionNumber);
    const installedJavaMajor = await getInstalledJavaMajor(finalJavaPath);
    if (installedJavaMajor && installedJavaMajor < requiredJavaMajor) {
        mainWindow.webContents.send('game-status', {
            type: 'java-warning',
            message: `Minecraft ${versionNumber} necesita Java ${requiredJavaMajor} o superior, pero la ruta de Java seleccionada es la ${installedJavaMajor}. El juego podría no arrancar; puedes cambiarla arriba o pulsar "Detectar".`
        });
    }

    let opts = {
        clientPackage: null,
        authorization,
        root,
        javaPath: finalJavaPath,
        skipVersionCheck: true,
        version: loaderVersionId
            ? { number: versionNumber, type: 'release', custom: loaderVersionId }
            : { number: versionNumber, type: 'release' },
        memory: {
            max: (memory && memory.max) || '4G',
            min: (memory && memory.min) || '2G'
        },
        ...(finalCustomArgs ? { customArgs: finalCustomArgs.split(/\s+/).filter(Boolean) } : {})
    };

    try {
        currentGameLogLines = [];
        gameProcess = await launcher.launch(opts);
        mainWindow.webContents.send('game-status', { type: 'launched' });
        playSessionStart = Date.now();
        playSessionTargetKey = targetKey;
    } catch (err) {
        console.error('[ERROR] Fallo al lanzar el juego:', err);
        gameProcess = null;
        mainWindow.webContents.send('game-status', {
            type: 'error',
            message: err && err.message ? err.message : String(err)
        });
    }
});

ipcMain.handle('open-crash-logs-folder', () => {
    fs.mkdirSync(CRASH_LOGS_DIR, { recursive: true });
    shell.openPath(CRASH_LOGS_DIR);
});

ipcMain.on('stop-game', () => {
    if (gameProcess) {
        console.log('[STOP] Deteniendo el juego...');
        gameProcess.kill();
        gameProcess = null;
        mainWindow.webContents.send('game-status', { type: 'stopped' });
    }
});
