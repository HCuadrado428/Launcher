// Ciclo de vida de una partida en main.js (launch-game / stop-game y el
// evento 'close' de minecraft-launcher-core). main.js solo se puede cargar
// dentro de Electron, así que aquí se simulan 'electron', el lanzador
// (minecraft-launcher-core) y las librerías que tiran de Electron, y se
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
    constructor() {
        super();
        this.webContents = new FakeWebContents();
    }
    loadFile() {}
    isDestroyed() { return false; }
    show() {}
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

class FakeLauncher extends EventEmitter {
    constructor() {
        super();
        this.launchCalls = 0;
        this.launchImpl = async () => null;
    }
    launch(opts) {
        this.launchCalls++;
        return this.launchImpl(opts);
    }
}
let fakeLauncher = null;

const fakeModules = {
    electron: fakeElectron,
    'electron-updater': { autoUpdater: {} },
    msmc: { Auth: null },
    'minecraft-launcher-core': {
        Client: class {
            constructor() {
                fakeLauncher = new FakeLauncher();
                return fakeLauncher;
            }
        },
        Authenticator: { getAuth: (name) => ({ name }) }
    }
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
    return fs.existsSync(crashLogsDir) ? fs.readdirSync(crashLogsDir) : [];
}

function launch(javaPath = '/usr/lib/jvm/java-21/bin/java') {
    ipcListeners.get('launch-game')({}, { javaPath, memory: { max: '4G', min: '2G' }, customArgs: '' });
}

function fakeGameProcess() {
    const child = new EventEmitter();
    child.killed = false;
    child.kill = () => {
        child.killed = true;
        // Como en la realidad: matar el proceso da código 1 en Windows.
        setImmediate(() => fakeLauncher.emit('close', 1));
    };
    return child;
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
    fakeLauncher.launchCalls = 0;
    fs.rmSync(crashLogsDir, { recursive: true, force: true });
});

test('si launch() devuelve null, se avisa con el motivo en vez de quedarse en "Juego iniciado"', async () => {
    fakeLauncher.launchImpl = async () => {
        // Lo que hace minecraft-launcher-core cuando Java no arranca.
        fakeLauncher.emit('debug', "[MCLC]: Couldn't start Minecraft due to: Error: java no responde");
        fakeLauncher.emit('close', 1);
        return null;
    };
    launch();
    await waitFor(() => statusTypes().includes('error'), 'estado error');

    assert.ok(!statusTypes().includes('launched'));
    assert.ok(!statusTypes().includes('closed'), "el 'close' de un juego que nunca arrancó se ignora");
    const error = sentStatuses.find((s) => s.type === 'error');
    assert.match(error.message, /java no responde/);
    assert.deepEqual(crashLogFiles(), []);
    assert.deepEqual(notifications, []);
});

test('"Detener" cierra el juego sin guardar crash log ni avisar de un cierre inesperado', async () => {
    const child = fakeGameProcess();
    fakeLauncher.launchImpl = async () => child;
    launch();
    await waitFor(() => statusTypes().includes('launched'), 'estado launched');

    ipcListeners.get('stop-game')();
    await waitFor(() => statusTypes().includes('stopped'), 'estado stopped');

    assert.ok(child.killed);
    assert.ok(!statusTypes().includes('closed'));
    assert.deepEqual(crashLogFiles(), []);
    assert.deepEqual(notifications, []);
});

test('un cierre con error de verdad sí guarda crash log (con el token tapado y el buffer limitado)', async () => {
    const child = fakeGameProcess();
    fakeLauncher.launchImpl = async () => child;
    launch();
    await waitFor(() => statusTypes().includes('launched'), 'estado launched');

    fakeLauncher.emit('data', 'arrancando con --accessToken secreto123 --version 1.21\n');
    for (let i = 0; i < 6000; i++) fakeLauncher.emit('data', `línea ${i}\n`);
    fakeLauncher.emit('close', 1);
    await waitFor(() => statusTypes().includes('closed'), 'estado closed');

    const files = crashLogFiles();
    assert.equal(files.length, 1);
    const log = fs.readFileSync(path.join(crashLogsDir, files[0]), 'utf-8');
    assert.ok(!log.includes('secreto123'), 'el access token no debe acabar en el crash log');
    assert.ok(log.includes('línea 5999'));
    assert.ok(!log.includes('línea 999\n'), 'solo se guardan las últimas salidas');
    assert.equal(notifications.length, 1);
});

test('una ruta de Java que no es java/javaw no se ejecuta', async () => {
    launch('C:\\Windows\\System32\\cmd.exe');
    await waitFor(() => statusTypes().includes('error'), 'estado error');
    assert.equal(fakeLauncher.launchCalls, 0);
    assert.match(sentStatuses.find((s) => s.type === 'error').message, /ruta de Java no es válida/);
});

test('un segundo "Iniciar" mientras se prepara el primero no lanza otro juego', async () => {
    fetchDelayMs = 50;
    fakeLauncher.launchImpl = async () => null;
    launch();
    launch();
    await waitFor(() => statusTypes().includes('warning'), 'estado warning');
    await waitFor(() => statusTypes().includes('error'), 'fin del primer lanzamiento');
    assert.equal(fakeLauncher.launchCalls, 1);
});

test('"Detener" durante la preparación cancela el lanzamiento', async () => {
    fetchDelayMs = 50;
    fakeLauncher.launchImpl = async () => fakeGameProcess();
    launch();
    await tick();
    ipcListeners.get('stop-game')();
    await waitFor(() => statusTypes().includes('stopped'), 'estado stopped');

    assert.equal(fakeLauncher.launchCalls, 0, 'no debe llegar a abrir Java');
    assert.ok(!statusTypes().includes('launched'));
});

test.after(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
});
