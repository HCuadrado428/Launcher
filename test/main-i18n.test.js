// Los mensajes del proceso principal (claves sys.*) usan el mismo
// diccionario que la interfaz: todas deben existir en los cinco idiomas.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { I18N, tm, setLanguageResolver } = require('../main/i18nMain');

test('todos los idiomas tienen exactamente las mismas claves', () => {
    const esKeys = Object.keys(I18N.es).sort();
    for (const lang of ['en', 'fr', 'de', 'pt']) {
        assert.deepEqual(Object.keys(I18N[lang]).sort(), esKeys, `faltan o sobran claves en "${lang}"`);
    }
});

test('toda clave sys.* usada en main/ existe en el diccionario', () => {
    const mainDir = path.join(__dirname, '..', 'main');
    const files = [
        path.join(__dirname, '..', 'main.js'),
        ...fs.readdirSync(mainDir).filter((f) => f.endsWith('.js')).map((f) => path.join(mainDir, f)),
        ...fs.readdirSync(path.join(mainDir, 'ipc')).map((f) => path.join(mainDir, 'ipc', f))
    ];
    const used = new Set();
    for (const file of files) {
        for (const match of fs.readFileSync(file, 'utf-8').matchAll(/tm\(\s*'(sys\.[^']+)'/g)) used.add(match[1]);
    }
    assert.ok(used.size > 30, 'debería encontrar las claves usadas');
    for (const key of used) assert.ok(I18N.es[key], `falta la clave ${key}`);
});

test('tm traduce según el idioma elegido y sustituye variables', () => {
    setLanguageResolver(() => 'en');
    assert.equal(tm('sys.game.syncFailed', { reason: 'boom' }), 'Could not sync the modpack: boom');
    setLanguageResolver(() => 'xx');
    assert.equal(tm('sys.game.syncFailed', { reason: 'boom' }), 'No se pudo sincronizar el modpack: boom');
    setLanguageResolver(() => { throw new Error('config rota'); });
    assert.equal(tm('sys.tray.quit'), 'Salir');
    setLanguageResolver(() => 'es');
});

test('cada causa de crash reconocida tiene su consejo traducido', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'main', 'crashAnalysis.js'), 'utf-8');
    const codes = [...source.matchAll(/code: '([a-zA-Z]+)'/g)].map((m) => m[1]);
    assert.ok(codes.length >= 5);
    for (const code of codes) assert.ok(I18N.es[`crash.hint.${code}`], `falta crash.hint.${code}`);
});

test('toda clave t(\'...\') usada en el renderer existe en el diccionario', () => {
    const rendererDir = path.join(__dirname, '..', 'renderer');
    const missing = [];
    for (const file of fs.readdirSync(rendererDir)) {
        const source = fs.readFileSync(path.join(rendererDir, file), 'utf-8');
        for (const match of source.matchAll(/\bt\('([^']+)'/g)) {
            if (!I18N.es[match[1]]) missing.push(`${file}: ${match[1]}`);
        }
    }
    assert.deepEqual(missing, []);
});
