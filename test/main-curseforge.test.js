// Huella de CurseForge (MurmurHash2 sin espacios) y lectura del loader de
// sus instancias.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { curseForgeFingerprint, parseCurseForgeLoader } = require('../main/curseforge');

test('curseForgeFingerprint coincide con MurmurHash2 (semilla 1) sin espacios', () => {
    // Valores de referencia calculados con el paquete "murmurhash" (v2).
    assert.equal(curseForgeFingerprint(Buffer.from('hello world')), 2824650221);
    assert.equal(curseForgeFingerprint(Buffer.from('Minecraft mod\n\tjar contents\r\n')), 1530571727);
    assert.equal(curseForgeFingerprint(Buffer.from('')), 1540447798);
    // Los espacios no cuentan: mismo resultado con o sin ellos.
    assert.equal(curseForgeFingerprint(Buffer.from('helloworld')), curseForgeFingerprint(Buffer.from('hello world')));
});

test('parseCurseForgeLoader entiende los nombres de loader de la app de CurseForge', () => {
    assert.deepEqual(parseCurseForgeLoader('forge-47.2.0'), { loader: 'forge', loaderVersion: '47.2.0' });
    assert.deepEqual(parseCurseForgeLoader('neoforge-21.1.77'), { loader: 'neoforge', loaderVersion: '21.1.77' });
    assert.deepEqual(parseCurseForgeLoader('fabric-0.15.7-1.20.1'), { loader: 'fabric', loaderVersion: '0.15.7' });
    assert.deepEqual(parseCurseForgeLoader('quilt-0.20.2-1.20.1'), { loader: 'quilt', loaderVersion: '0.20.2' });
    assert.deepEqual(parseCurseForgeLoader(''), { loader: 'vanilla', loaderVersion: '' });
    assert.deepEqual(parseCurseForgeLoader('liteloader-1.12'), { loader: 'vanilla', loaderVersion: '' });
});
