// main/config.js es lo que cifra config.json en disco (safeStorage). Se
// mockea 'electron' (app.getPath + safeStorage) porque este módulo no se
// puede cargar fuera de un proceso de Electron real; es la misma técnica
// usada para verificar a mano el reparto de main.js en módulos.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-launcher-config-test-'));
// En la app real, Electron ya se encarga de que app.getPath('userData')
// exista antes de que nadie escriba ahí; aquí hay que crearlo a mano.
fs.mkdirSync(path.join(userDataDir, 'userData'), { recursive: true });

function makeFakeElectron(encryptionAvailable) {
    return {
        app: { getPath: (name) => path.join(userDataDir, name) },
        safeStorage: {
            isEncryptionAvailable: () => encryptionAvailable,
            // No es cifrado de verdad, pero sí irreversible sin pasar por
            // decryptString (base64, no deja el texto plano reconocible en
            // disco) y con un prefijo para poder distinguirlo del JSON
            // plano del otro caso de prueba. Suficiente para comprobar que
            // loadConfig/saveConfig pasan de verdad por safeStorage.
            encryptString: (s) => Buffer.concat([Buffer.from('ENC:'), Buffer.from(Buffer.from(s).toString('base64'))]),
            decryptString: (b) => {
                const str = b.toString('utf-8');
                if (!str.startsWith('ENC:')) throw new Error('no cifrado');
                return Buffer.from(str.slice(4), 'base64').toString('utf-8');
            }
        }
    };
}

function loadConfigModuleWithMock(encryptionAvailable) {
    const originalLoad = Module._load;
    let configModule;
    Module._load = function (request, parent, isMain) {
        if (request === 'electron') return makeFakeElectron(encryptionAvailable);
        return originalLoad.apply(this, arguments);
    };
    try {
        delete require.cache[require.resolve('../main/config')];
        configModule = require('../main/config');
    } finally {
        Module._load = originalLoad;
    }
    return configModule;
}

test('con safeStorage disponible, config.json se guarda cifrado (no en JSON plano)', () => {
    const { loadConfig, saveConfig } = loadConfigModuleWithMock(true);
    saveConfig({ hello: 'world', session: { token: 'secreto' } });

    const raw = fs.readFileSync(path.join(userDataDir, 'userData', 'config.json'), 'utf-8');
    assert.ok(!raw.includes('secreto'), 'el token no debería aparecer en texto plano en disco');
    assert.ok(raw.startsWith('ENC:'), 'debería estar pasado por safeStorage.encryptString');

    const reloaded = loadConfig();
    assert.equal(reloaded.session.token, 'secreto');
});

test('sin safeStorage disponible, cae a JSON plano en vez de romperse', () => {
    const { loadConfig, saveConfig } = loadConfigModuleWithMock(false);
    saveConfig({ foo: 'bar' });

    const raw = fs.readFileSync(path.join(userDataDir, 'userData', 'config.json'), 'utf-8');
    const parsed = JSON.parse(raw); // no debe lanzar: tiene que ser JSON de verdad
    assert.equal(parsed.foo, 'bar');

    const reloaded = loadConfig();
    assert.equal(reloaded.foo, 'bar');
});

test('saveConfig combina con lo que ya había en vez de reemplazarlo entero', () => {
    const { loadConfig, saveConfig } = loadConfigModuleWithMock(true);
    saveConfig({ a: 1 });
    saveConfig({ b: 2 });
    const cfg = loadConfig();
    assert.equal(cfg.a, 1);
    assert.equal(cfg.b, 2);
});

test.after(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
});
