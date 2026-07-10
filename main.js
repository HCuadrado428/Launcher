const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Client, Authenticator } = require('minecraft-launcher-core');
const launcher = new Client();

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

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        return {};
    }
}

function saveConfig(partial) {
    try {
        const current = loadConfig();
        const merged = { ...current, ...partial };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
        return merged;
    } catch (err) {
        console.error('[ERROR] No se pudo guardar la config:', err);
        return loadConfig();
    }
}

// --- Detección automática de Java -----------------------------------------

function parseVersionFromDirName(name) {
    const matches = name.match(/\d+/g);
    return matches ? matches.map(Number) : [0];
}

function compareVersionArrays(a, b) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const x = a[i] || 0;
        const y = b[i] || 0;
        if (x !== y) return x - y;
    }
    return 0;
}

function findJavaCandidates() {
    const candidates = [];
    const candidateBaseDirs = [];

    if (process.platform === 'win32') {
        candidateBaseDirs.push(
            'C:\\Program Files\\Java',
            'C:\\Program Files (x86)\\Java',
            'C:\\Program Files\\Eclipse Adoptium',
            'C:\\Program Files\\Microsoft\\jdk',
            'C:\\Program Files\\Zulu',
            'C:\\Program Files\\Amazon Corretto'
        );
    } else if (process.platform === 'darwin') {
        candidateBaseDirs.push('/Library/Java/JavaVirtualMachines');
    } else {
        candidateBaseDirs.push('/usr/lib/jvm');
    }

    for (const baseDir of candidateBaseDirs) {
        if (!fs.existsSync(baseDir)) continue;

        let entries;
        try {
            entries = fs.readdirSync(baseDir, { withFileTypes: true });
        } catch (err) {
            continue;
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const dirName = entry.name;
            let javaExe;
            if (process.platform === 'win32') {
                javaExe = path.join(baseDir, dirName, 'bin', 'java.exe');
            } else if (process.platform === 'darwin') {
                javaExe = path.join(baseDir, dirName, 'Contents', 'Home', 'bin', 'java');
            } else {
                javaExe = path.join(baseDir, dirName, 'bin', 'java');
            }

            if (fs.existsSync(javaExe)) {
                candidates.push({ path: javaExe, version: parseVersionFromDirName(dirName) });
            }
        }
    }

    if (process.env.JAVA_HOME) {
        const exe = process.platform === 'win32'
            ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe')
            : path.join(process.env.JAVA_HOME, 'bin', 'java');
        if (fs.existsSync(exe)) {
            candidates.push({ path: exe, version: parseVersionFromDirName(path.basename(process.env.JAVA_HOME)) });
        }
    }

    if (process.platform === 'win32' && process.env.APPDATA) {
        const mcRuntimeDir = path.join(process.env.APPDATA, '.minecraft', 'runtime');
        if (fs.existsSync(mcRuntimeDir)) {
            try {
                const components = fs.readdirSync(mcRuntimeDir, { withFileTypes: true }).filter(d => d.isDirectory());
                for (const comp of components) {
                    const possible = path.join(mcRuntimeDir, comp.name, 'windows-x64', comp.name, 'bin', 'java.exe');
                    if (fs.existsSync(possible)) {
                        candidates.push({ path: possible, version: parseVersionFromDirName(comp.name) });
                    }
                }
            } catch (err) {
                // ignoramos si la estructura no coincide
            }
        }
    }

    return candidates;
}

function findNewestJava() {
    const candidates = findJavaCandidates();
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => compareVersionArrays(b.version, a.version));
    return candidates[0].path;
}

// --- Última versión de Minecraft --------------------------------------------

// Guardamos en memoria la última versión que conseguimos consultar, para no
// tener que golpear la API de Mojang en cada lanzamiento y para tener un
// fallback si en algún momento no hay internet.
let cachedLatestVersion = null;

async function fetchLatestMinecraftVersion() {
    const response = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    if (!response.ok) {
        throw new Error(`Mojang respondió con estado ${response.status}`);
    }
    const data = await response.json();
    // data.latest.release = la última versión "release" (no snapshot).
    // Si en el futuro quieres poder elegir snapshots, data.latest.snapshot
    // tiene la última snapshot.
    if (!data || !data.latest || !data.latest.release) {
        throw new Error('La respuesta de Mojang no tiene el formato esperado.');
    }
    cachedLatestVersion = data.latest.release;
    return cachedLatestVersion;
}

// Devuelve la última versión disponible. Si falla la consulta (sin
// internet, Mojang caído, etc.) cae a la última que se consiguió con
// éxito antes, y si nunca se consiguió ninguna, a una versión fija
// conocida como último recurso.
async function getMinecraftVersionToLaunch() {
    try {
        return await fetchLatestMinecraftVersion();
    } catch (err) {
        console.warn('[WARN] No se pudo consultar la última versión de Minecraft:', err.message);
        return cachedLatestVersion || '1.20.1';
    }
}

// ----------------------------------------------------------------------------

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        backgroundColor: '#12181f',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

launcher.on('debug', (e) => console.log(`[DEBUG] ${e}`));
launcher.on('data', (e) => console.log(`[GAME] ${e}`));

launcher.on('progress', (e) => {
    if (mainWindow) mainWindow.webContents.send('game-progress', e);
});
launcher.on('download-status', (e) => {
    if (mainWindow) mainWindow.webContents.send('game-progress', e);
});

launcher.on('close', (code) => {
    console.log(`[CLOSE] El juego se cerró con código ${code}`);
    gameProcess = null;
    if (mainWindow) {
        mainWindow.webContents.send('game-status', { type: 'closed', code });
    }
});

// --- Config / cuentas -------------------------------------------------------

ipcMain.handle('get-config', () => loadConfig());

ipcMain.handle('login-offline', (event, username) => {
    const account = { type: 'offline', username: username || 'Jugador' };
    saveConfig({ account });
    return account;
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
        // 'electron' hace que msmc abra su propia ventana de login de
        // Microsoft dentro de la app, no hace falta gestionarla a mano.
        const xboxManager = await authManager.launch('electron');
        const token = await xboxManager.getMinecraft();
        const mclcAuth = token.mclc(); // objeto de autorización listo para minecraft-launcher-core

        const account = {
            type: 'microsoft',
            username: mclcAuth.name,
            uuid: mclcAuth.uuid,
            auth: mclcAuth
        };

        saveConfig({ account });
        return { success: true, account: { type: 'microsoft', username: account.username, uuid: account.uuid } };
    } catch (err) {
        console.error('[ERROR] Login con Microsoft fallido:', err);
        return {
            success: false,
            message: err && err.message ? err.message : 'No se pudo completar el login con Microsoft.'
        };
    }
});

ipcMain.handle('logout', () => {
    const cfg = loadConfig();
    delete cfg.account;
    saveConfig(cfg);
    return true;
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

ipcMain.handle('get-latest-mc-version', () => getMinecraftVersionToLaunch());

// --- Lanzar / detener el juego ----------------------------------------------

ipcMain.on('launch-game', async (event, { javaPath, memory }) => {
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

    saveConfig({ javaPath: finalJavaPath, memory });

    const authorization = account.type === 'microsoft'
        ? account.auth
        : Authenticator.getAuth(account.username);

    const versionNumber = await getMinecraftVersionToLaunch();
    mainWindow.webContents.send('game-status', { type: 'version-selected', version: versionNumber });

    let opts = {
        clientPackage: null,
        authorization,
        root: path.join(app.getPath('appData'), '.milauncher'),
        javaPath: finalJavaPath,
        skipVersionCheck: true,
        version: {
            number: versionNumber,
            type: "release"
        },
        memory: {
            max: (memory && memory.max) || '4G',
            min: (memory && memory.min) || '2G'
        }
    };

    try {
        gameProcess = await launcher.launch(opts);
        mainWindow.webContents.send('game-status', { type: 'launched' });
    } catch (err) {
        console.error('[ERROR] Fallo al lanzar el juego:', err);
        gameProcess = null;
        mainWindow.webContents.send('game-status', {
            type: 'error',
            message: err && err.message ? err.message : String(err)
        });
    }
});

ipcMain.on('stop-game', () => {
    if (gameProcess) {
        console.log('[STOP] Deteniendo el juego...');
        gameProcess.kill();
        gameProcess = null;
        mainWindow.webContents.send('game-status', { type: 'stopped' });
    }
});
