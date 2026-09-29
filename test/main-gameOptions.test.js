// Opciones de lanzamiento que vienen del renderer y acaban en la línea de
// comandos del juego: memoria y servidor al que entrar directamente.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeMemory, normalizeServerAddress, quickPlayForServer } = require('../main/gameOptions');

test('sanitizeMemory acepta "4G"/"2048M" y usa los valores por defecto para lo demás', () => {
    assert.deepEqual(sanitizeMemory({ max: '8G', min: '2048M' }), { max: '8G', min: '2048M' });
    assert.deepEqual(sanitizeMemory({ max: '4G -XX:+Evil', min: '' }), { max: '4G', min: '2G' });
    assert.deepEqual(sanitizeMemory(null), { max: '4G', min: '2G' });
});

test('normalizeServerAddress acepta host y puerto, y rechaza cualquier otra cosa', () => {
    assert.equal(normalizeServerAddress(' play.example.com '), 'play.example.com');
    assert.equal(normalizeServerAddress('192.168.1.10:25566'), '192.168.1.10:25566');
    for (const bad of ['', '--demo', 'a b', 'host:0', 'host:70000', 'host:abc', 'host;rm', null]) {
        assert.equal(normalizeServerAddress(bad), null, `debería rechazar ${JSON.stringify(bad)}`);
    }
});

test('quickPlayForServer usa quickPlay desde 1.20 y --server/--port antes', () => {
    assert.deepEqual(quickPlayForServer('mc.example.com', '1.21.1'), { type: 'multiplayer', identifier: 'mc.example.com' });
    assert.deepEqual(quickPlayForServer('mc.example.com:25570', '1.20'), { type: 'multiplayer', identifier: 'mc.example.com:25570' });
    assert.deepEqual(quickPlayForServer('mc.example.com', '1.19.4'), { type: 'legacy', identifier: 'mc.example.com' });
    assert.equal(quickPlayForServer('--demo', '1.21.1'), null);
});
