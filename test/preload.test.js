// preload.js expone window.electronAPI. Los errores de ipcMain.handle llegan
// con un prefijo de Electron que no debe acabar en los avisos de la interfaz.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadPreload(invokeImpl) {
    let exposed = null;
    const fakeElectron = {
        contextBridge: { exposeInMainWorld: (name, api) => { exposed = api; } },
        ipcRenderer: { invoke: invokeImpl, send: () => {}, on: () => {}, removeListener: () => {} }
    };
    const originalLoad = Module._load;
    Module._load = function (request) {
        if (request === 'electron') return fakeElectron;
        return originalLoad.apply(this, arguments);
    };
    try {
        delete require.cache[require.resolve('../preload.js')];
        require('../preload.js');
    } finally {
        Module._load = originalLoad;
    }
    return exposed;
}

test('los errores del proceso principal llegan sin el prefijo de Electron', async () => {
    const api = loadPreload(async () => {
        throw new Error("Error invoking remote method 'modpacks-sync': Error: Necesitas iniciar sesión para usar los modpacks.");
    });
    await assert.rejects(api.syncModpack('abc'), { message: 'Necesitas iniciar sesión para usar los modpacks.' });
});

test('las respuestas correctas pasan tal cual y los argumentos llegan al canal', async () => {
    const calls = [];
    const api = loadPreload(async (channel, payload) => { calls.push([channel, payload]); return 'ok'; });
    assert.equal(await api.getPlaytime('pack-1'), 'ok');
    assert.deepEqual(calls, [['get-playtime', { modpackId: 'pack-1' }]]);
});
