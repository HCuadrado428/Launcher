// Ciclo de vida de una partida (launch-game / stop-game y el cierre del
// juego). main.js solo se puede cargar dentro de Electron, así que aquí se
// simulan 'electron', el lanzamiento real (main/gameLauncher.js) y las
// librerías que tiran de Electron, y se
// observa qué estados le llegan a la ventana ('game-status').
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const EventEmitter = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// main.js escribe en consola cada línea del juego; aquí solo ensucia la salida.
console.log = () => {};
console.warn = () => {};

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-launcher-lifecycle-'));
const crashLogsDir = path.join(userDataDir, 'userData', 'crash-logs');
// En la app real Electron crea userData antes de que nadie escriba ahí.
fs.mkdirSync(path.join(userDataDir, 'userData'), { recursive: true });

const ipcHandlers = new Map();
const ipcListeners = new Map();
const sentStatuses = [];
const notifications = [];

class FakeWebContents extends EventEmitter {
    send(channel, payload) {
        if (channel === 'game-status') sentStatuses.push(payload);
    }
    isLoading() { return false; }
    setWindowOpenHandler() {}
}

class FakeBrowserWindow extends EventEmitter {
    constructor(options = {}) {
        super();
        // La ventana principal es la que tiene preload.
        if (options.webPreferences && options.webPreferences.preload) FakeBrowserWindow.lastCreated = this;
        this.webContents = new FakeWebContents();
    }
    loadFile() {}
    isDestroyed() { return false; }
    hide() { this.hidden = true; }
    show() { this.hidden = false; }
    close() {}
    focus() {}
}

const fakeElectron = {
    app: {
        getPath: (name) => path.join(userDataDir, name),
        getVersion: () => '0.0.0-test',
        getLocale: () => 'es',
        isPackaged: false,
        requestSingleInstanceLock: () => true,
        whenReady: () => Promise.resolve(),
        on: () => {},
        quit: () => {},
        setAsDefaultProtocolClient: () => {},
        getFileIcon: async () => ({})
    },
    ipcMain: {
        handle: (name, fn) => ipcHandlers.set(name, fn),
        on: (name, fn) => ipcListeners.set(name, fn)
    },
    BrowserWindow: FakeBrowserWindow,
    dialog: {},
    Notification: class {
        static isSupported() { return true; }
        constructor(opts) { this.opts = opts; }
        show() { notifications.push(this.opts); }
    },
    Tray: class { setToolTip() {} setContextMenu() {} on() {} },
    Menu: { setApplicationMenu: () => {}, buildFromTemplate: () => ({}) },
    nativeImage: { createFromPath: () => ({ isEmpty: () => false }), createEmpty: () => ({}) },
    shell: {},
    safeStorage: { isEncryptionAvailable: () => false }
};

// El lanzamiento real (@xmcl) se sustituye por uno falso: se usan las
// funciones puras de verdad de main/gameLauncher.js, pero startMinecraft
// devuelve un proceso simulado y no se instala nada.
const fakeGame = {
    startCalls: 0,
    lastOptions: null,
    startImpl: async () => { throw new Error('sin implementar'); }
};

function fakeGameProcess() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    const watcher = new EventEmitter();
    child.killed = false;
    child.kill = () => {
        child.killed = true;
        // Como en la realidad: matar el proceso da código 1 en Windows.
        setImmediate(() => watcher.emit('minecraft-exit', { code: 1, signal: null, crashReport: '' }));
    };
    return { child, watcher };
}

const fakeModules = {
    electron: fakeElectron,
    'electron-updater': { autoUpdater: {} },
    msmc: { Auth: null }
};

// Sin red: Mojang y el backend "no responden", así que vanilla cae a la
// versión de respaldo y la cuenta offline se guarda sin sesión.
let fetchDelayMs = 0;
globalThis.fetch = async () => {
    if (fetchDelayMs) await new Promise((resolve) => setTimeout(resolve, fetchDelayMs));
    throw new TypeError('fetch failed (sin red en los tests)');
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(fakeModules, request)) return fakeModules[request];
    if (request === './gameLauncher') {
        const real = originalLoad.apply(this, arguments);
        return {
            ...real,
            ensureVersionInstalled: async () => {},
            startMinecraft: (options) => {
                fakeGame.startCalls++;
                fakeGame.lastOptions = options;
                return fakeGame.startImpl(options);
            }
        };
    }
    return originalLoad.apply(this, arguments);
};
try {
    require('../main.js');
} finally {
    Module._load = originalLoad;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, what) {
    for (let i = 0; i < 200; i++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`No llegó: ${what}. Estados: ${JSON.stringify(sentStatuses)}`);
}

function statusTypes() {
    return sentStatuses.map((s) => s.type);
}

function crashLogFiles() {
    // En esa carpeta también está launcher.log (ver logFile.js).
    return fs.existsSync(crashLogsDir) ? fs.readdirSync(crashLogsDir).filter((f) => f.startsWith('crash-')) : [];
}

function launch(javaPath = '/usr/lib/jvm/java-21/bin/java', extra = {}) {
    ipcListeners.get('launch-game')({}, { javaPath, memory: { max: '4G', min: '2G' }, customArgs: '', ...extra });
}

test.before(async () => {
    // Deja que app.whenReady() cree la ventana (falsa) y hace login offline.
    await tick();
    await ipcHandlers.get('login-offline')({}, 'Steve');
});

beforeEach(() => {
    sentStatuses.length = 0;
    notifications.length = 0;
    fetchDelayMs = 0;
    fakeGame.startCalls = 0;
    fakeGame.lastOptions = null;
    fs.rmSync(crashLogsDir, { recursive: true, force: true });
});

test('si Minecraft no arranca, se avisa con el motivo en vez de quedarse en "Juego iniciado"', async () => {
    fakeGame.startImpl = async () => { throw new Error('java no responde'); };
    launch();
    await waitFor(() => statusTypes().includes('error'), 'estado error');

    assert.ok(!statusTypes().includes('launched'));
    assert.match(sentStatuses.find((s) => s.type === 'error').message, /java no responde/);
    assert.deepEqual(crashLogFiles(), []);
    assert.deepEqual(notifications, []);
});

test('una cuenta offline lanza con el UUID de siempre (el de minecraft-launcher-core)', async () => {
    fakeGame.startImpl = async () => { throw new Error('parar aquí'); };
    launch();
    await waitFor(() => fakeGame.lastOptions !== null, 'llamada a startMinecraft');
    const { legacyOfflineUuid } = require('../main/gameLauncher');
    assert.equal(fakeGame.lastOptions.gameProfile.name, 'Steve');
    assert.equal(fakeGame.lastOptions.gameProfile.id, legacyOfflineUuid('Steve'));
    assert.equal(fakeGame.lastOptions.userType, 'legacy');
    assert.equal(fakeGame.lastOptions.maxMemory, 4096);
    await waitFor(() => statusTypes().includes('error'), 'fin del lanzamiento');
});

test('"Detener" cierra el juego sin guardar crash log ni avisar de un cierre inesperado', async () => {
    const proc = fakeGameProcess();
    fakeGame.startImpl = async () => proc;
    launch();
    await waitFor(() => statusTypes().includes('launched'), 'estado launched');

    ipcListeners.get('stop-game')();
    await waitFor(() => statusTypes().includes('stopped'), 'estado stopped');

    assert.ok(proc.child.killed);
    assert.ok(!statusTypes().includes('closed'));
    assert.deepEqual(crashLogFiles(), []);
    assert.deepEqual(notifications, []);
});

test('un cierre con error de verdad sí guarda crash log (con el token tapado y el buffer limitado)', async () => {
    const proc = fakeGameProcess();
    fakeGame.startImpl = async () => proc;
    launch();
    await waitFor(() => statusTypes().includes('launched'), 'estado launched');

    proc.child.stdout.emit('data', Buffer.from('arrancando con --accessToken secreto123 --version 1.21\n'));
    for (let i = 0; i < 6000; i++) proc.child.stdout.emit('data', Buffer.from(`línea ${i}\n`));
    proc.watcher.emit('minecraft-exit', { code: 1, signal: null, crashReport: '---- Minecraft Crash Report ----\nDescripción del crash' });
    await waitFor(() => statusTypes().includes('closed'), 'estado closed');

    const files = crashLogFiles();
    assert.equal(files.length, 1);
    assert.equal(sentStatuses.find((s) => s.type === 'closed').hasCrashLog, true);
    const log = fs.readFileSync(path.join(crashLogsDir, files[0]), 'utf-8');
    assert.ok(!log.includes('secreto123'), 'el access token no debe acabar en el crash log');
    assert.ok(log.includes('línea 5999'));
    assert.ok(!log.includes('línea 999\n'), 'solo se guardan las últimas salidas');
    assert.ok(log.includes('Minecraft Crash Report'), 'el informe de crash del juego se adjunta');
    assert.equal(notifications.length, 1);
});

test('el aviso de crash incluye una pista cuando reconoce la causa', async () => {
    const proc = fakeGameProcess();
    fakeGame.startImpl = async () => proc;
    launch();
    await waitFor(() => statusTypes().includes('launched'), 'estado launched');

    proc.child.stderr.emit('data', Buffer.from('Exception in thread "main" java.lang.OutOfMemoryError: Java heap space\n'));
    proc.watcher.emit('minecraft-exit', { code: 1, signal: null, crashReport: '' });
    await waitFor(() => statusTypes().includes('closed'), 'estado closed');
    assert.equal(sentStatuses.find((s) => s.type === 'closed').crashHint, 'outOfMemory');
});

test('"Entrar" en un servidor favorito pasa quickPlay al lanzador', async () => {
    fakeGame.startImpl = async () => { throw new Error('parar aquí'); };
    launch(undefined, { server: 'play.example.com:25570' });
    await waitFor(() => fakeGame.lastOptions !== null, 'llamada a startMinecraft');
    // Sin red la versión cae a la de respaldo (1.20.1), que ya usa quickPlay.
    assert.equal(fakeGame.lastOptions.quickPlayMultiplayer, 'play.example.com:25570');
    await waitFor(() => statusTypes().includes('error'), 'fin del primer lanzamiento');

    fakeGame.lastOptions = null;
    sentStatuses.length = 0;
    launch(undefined, { server: '--demo' });
    await waitFor(() => fakeGame.lastOptions !== null, 'segunda llamada a startMinecraft');
    assert.equal(fakeGame.lastOptions.quickPlayMultiplayer, undefined, 'una dirección inválida se ignora');
    assert.equal(fakeGame.lastOptions.server, undefined);
    await waitFor(() => statusTypes().includes('error'), 'fin del segundo lanzamiento');
});

test('con "Ocultar el launcher mientras juegas", la ventana se oculta y vuelve al cerrar el juego', async () => {
    await ipcHandlers.get('set-hide-while-playing')({}, true);
    const proc = fakeGameProcess();
    fakeGame.startImpl = async () => proc;
    launch();
    await waitFor(() => statusTypes().includes('launched'), 'estado launched');
    const win = fakeElectron.BrowserWindow.lastCreated;
    assert.equal(win.hidden, true);

    proc.watcher.emit('minecraft-exit', { code: 0, signal: null, crashReport: '' });
    await waitFor(() => statusTypes().includes('closed'), 'estado closed');
    assert.equal(win.hidden, false);
    await ipcHandlers.get('set-hide-while-playing')({}, false);
});

test('una ruta de Java que no es java/javaw no se ejecuta', async () => {
    launch('C:\\Windows\\System32\\cmd.exe');
    await waitFor(() => statusTypes().includes('error'), 'estado error');
    assert.equal(fakeGame.startCalls, 0);
    assert.match(sentStatuses.find((s) => s.type === 'error').message, /ruta de Java no es válida/);
});

test('un segundo "Iniciar" mientras se prepara el primero no lanza otro juego', async () => {
    fetchDelayMs = 50;
    fakeGame.startImpl = async () => { throw new Error('parar aquí'); };
    launch();
    launch();
    await waitFor(() => statusTypes().includes('warning'), 'estado warning');
    await waitFor(() => statusTypes().includes('error'), 'fin del primer lanzamiento');
    assert.equal(fakeGame.startCalls, 1);
});

test('"Detener" durante la preparación cancela el lanzamiento', async () => {
    fetchDelayMs = 50;
    fakeGame.startImpl = async () => fakeGameProcess();
    launch();
    await tick();
    ipcListeners.get('stop-game')();
    await waitFor(() => statusTypes().includes('stopped'), 'estado stopped');

    assert.equal(fakeGame.startCalls, 0, 'no debe llegar a abrir Java');
    assert.ok(!statusTypes().includes('launched'));
});

test.after(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
});
