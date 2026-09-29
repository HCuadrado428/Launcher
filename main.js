const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const { autoUpdater } = require('electron-updater');

const windowState = require('./main/windowState');
const { fetchWithTimeout, normalizeImageContentType } = require('./main/httpUtils');
const { loadConfig } = require('./main/config');
const { getBackendUrl } = require('./main/backend');
const { setLanguageResolver, tm } = require('./main/i18nMain');
const { notify } = require('./main/notify');
const { registerGameIpc } = require('./main/game');
const { registerAccountsIpc } = require('./main/ipc/accounts');
const { registerModpacksIpc, isValidInviteToken } = require('./main/ipc/modpacks');
const { registerFilesIpc } = require('./main/ipc/files');
const { version: APP_VERSION } = require('./package.json');

// ============================================================================
// PROCESO PRINCIPAL: ventana, bandeja, actualizaciones y deep links.
// La lógica de cada área vive en main/ (sincronización de modpacks, juego,
// cuentas...) y los manejadores IPC en main/ipc/.
// ============================================================================

// Los mensajes del proceso principal salen en el idioma elegido en la UI.
setLanguageResolver(() => loadConfig().language || 'es');

registerAccountsIpc();
registerModpacksIpc();
registerFilesIpc();
registerGameIpc();

let mainWindow;
let pendingDeepLink = null;
let tray = null;
let isQuitting = false;

const APP_ICON_PATH = path.join(__dirname, 'build', 'icon.ico');

function showMainWindow() {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
}

// ============================================================================
// BANDEJA DEL SISTEMA
// ============================================================================

// Cerrar la ventana no cierra el launcher del todo: se queda en la bandeja
// del sistema para no perder la sesión ni la partida en curso por un clic
// accidental en la X. Solo se cierra de verdad desde el menú de la bandeja
// o al instalar una actualización.
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
        tray.setContextMenu(Menu.buildFromTemplate([
            { label: tm('sys.tray.open'), click: showMainWindow },
            { type: 'separator' },
            { label: tm('sys.tray.quit'), click: () => { isQuitting = true; app.quit(); } }
        ]));
    };
    rebuildMenu();

    tray.on('click', showMainWindow);
    // El idioma puede cambiar mientras la app está abierta; el menú se
    // reconstruye la próxima vez que se abre para reflejarlo.
    tray.on('right-click', rebuildMenu);
}

// ============================================================================
// AUTO-ACTUALIZACIÓN (electron-updater + GitHub Releases)
// ============================================================================

// Comprueba actualizaciones publicadas como GitHub Release del repo
// configurado en package.json ("build.publish"). Solo tiene sentido en la app
// empaquetada: en desarrollo (electron .) no hay artefacto publicado que
// comprobar y autoUpdater lanzaría un error.
//
// No se descarga automáticamente al detectar una versión nueva: se avisa al
// renderer para que muestre un popup y el usuario decida. Si elige "más
// tarde", se le volverá a preguntar la próxima vez que abra el launcher.
function setupAutoUpdates() {
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    const send = (type, extra) => windowState.sendToWindow('update-status', { type, ...extra });

    autoUpdater.on('update-available', (info) => {
        // info.releaseNotes puede venir como string (un solo release) o como
        // array de {version, note} (varios releases desde la instalada); se
        // normaliza siempre a texto plano.
        let releaseNotes = '';
        if (typeof info.releaseNotes === 'string') {
            releaseNotes = info.releaseNotes;
        } else if (Array.isArray(info.releaseNotes)) {
            releaseNotes = info.releaseNotes.map((n) => n.note || '').join('\n\n');
        }
        send('available', { version: info.version, releaseNotes: releaseNotes.replace(/<[^>]+>/g, '').trim() });
    });
    autoUpdater.on('update-not-available', () => send('not-available'));
    autoUpdater.on('download-progress', (progress) => send('downloading', { percent: Math.round(progress.percent) }));
    autoUpdater.on('update-downloaded', (info) => {
        send('downloaded', { version: info.version });
        notify('Ember Launcher', tm('sys.notify.updateReady', { version: info.version }));
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

// Comprobación manual (botón "Buscar actualizaciones" en la UI). Reusa los
// mismos eventos de arriba para avisar al renderer del resultado.
ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) return { ok: false, message: tm('sys.updates.devOnly') };
    try {
        await autoUpdater.checkForUpdates();
        return { ok: true };
    } catch (err) {
        return { ok: false, message: err && err.message ? err.message : String(err) };
    }
});

// ============================================================================
// DATOS PARA LA CABECERA Y EL ESTADO DEL SERVIDOR
// ============================================================================

// RAM física total del sistema, para avisar en la UI si el usuario asigna
// más memoria de la que realmente hay (eso causa crashes confusos de Java).
ipcMain.handle('get-system-memory', () => os.totalmem());

// Render 3D del skin para la cabecera de cuenta. Se pide desde el proceso
// principal (no como <img src> directo en el renderer) porque Visage exige
// un User-Agent identificable que un <img> no puede mandar, y así se puede
// probar Crafatar primero y caer a Visage si falla.
async function fetchImageAsDataUri(url, extraHeaders) {
    const res = await fetchWithTimeout(url, { headers: extraHeaders }, 8000);
    if (!res.ok) throw new Error(`estado ${res.status}`);
    const contentType = normalizeImageContentType(res.headers.get('content-type'));
    if (!contentType) throw new Error(`tipo de contenido inesperado (${res.headers.get('content-type')})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString('base64')}`;
}

ipcMain.handle('get-skin-render', async (event, { uuid } = {}) => {
    if (!uuid) return null;
    try {
        return await fetchImageAsDataUri(`https://crafatar.com/renders/body/${encodeURIComponent(uuid)}?scale=6&overlay`);
    } catch (err) {
        console.warn('[WARN] Crafatar no disponible, probando con Visage:', err.message);
    }
    try {
        return await fetchImageAsDataUri(`https://visage.surgeplay.com/full/256/${encodeURIComponent(uuid)}`, {
            'User-Agent': `EmberLauncher/${APP_VERSION} (+https://github.com/HCuadrado428/Launcher)`
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

// ============================================================================
// VENTANA Y DEEP LINKS (milauncher://invite/TOKEN)
// ============================================================================

function handleDeepLink(url) {
    const match = /^milauncher:\/\/invite\/([^/?#]+)\/?$/.exec(url || '');
    if (!match) return;
    let token;
    try {
        token = decodeURIComponent(match[1]);
    } catch (err) {
        return;
    }
    if (!isValidInviteToken(token)) return;
    if (mainWindow && !mainWindow.webContents.isLoading()) {
        mainWindow.webContents.send('invite-received', { token });
        showMainWindow();
    } else {
        pendingDeepLink = token;
    }
}

// La ventana principal tiene acceso a window.electronAPI (preload): si
// llegara a navegar a otra página (un enlace, un location.href...) esa
// página tendría el mismo acceso. Nunca tiene que salir de index.html ni
// abrir ventanas nuevas. No se aplica a todas las ventanas de la app porque
// el login de Microsoft (msmc) abre la suya propia y ahí sí hay que navegar.
function lockDownNavigation(win) {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
}

// Pantalla de carga: tapa el parpadeo en blanco/negro que da Electron los
// primeros instantes mientras arranca el proceso de renderizado, y se cierra
// sola en cuanto la ventana principal tiene su primer frame pintado (con un
// mínimo de medio segundo para que no sea un parpadeo aún más raro).
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
        webPreferences: { contextIsolation: true, sandbox: true }
    });
    lockDownNavigation(splash);
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
            contextIsolation: true,
            sandbox: true
        }
    });
    lockDownNavigation(mainWindow);
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

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', (event, argv) => {
        showMainWindow();
        const url = argv.find((arg) => arg.startsWith('milauncher://'));
        if (url) handleDeepLink(url);
    });

    app.on('open-url', (event, url) => {
        event.preventDefault();
        handleDeepLink(url);
    });

    app.whenReady().then(() => {
        Menu.setApplicationMenu(null);

        // Registro del protocolo milauncher:// para los links de invitación.
        // En desarrollo ("electron .") hace falta pasar la ruta del proyecto.
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
        const initialUrl = process.argv.find((arg) => arg.startsWith('milauncher://'));
        if (initialUrl) handleDeepLink(initialUrl);
    });

    app.on('before-quit', () => {
        isQuitting = true;
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}
