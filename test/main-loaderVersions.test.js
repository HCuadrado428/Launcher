// Selección de versiones de NeoForge/Quilt y loaders compatibles en Modrinth.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isSupportedLoader, neoForgePrefixFor, neoForgeVersionsForMc, quiltVersionsFromMeta, modrinthLoadersFor } = require('../main/loaderVersions');

test('neoForgePrefixFor sigue la numeración de NeoForge', () => {
    assert.equal(neoForgePrefixFor('1.20.2'), '20.2.');
    assert.equal(neoForgePrefixFor('1.20.4'), '20.4.');
    assert.equal(neoForgePrefixFor('1.21'), '21.0.');
    assert.equal(neoForgePrefixFor('1.21.1'), '21.1.');
    assert.equal(neoForgePrefixFor('26.1'), '26.1.0.');
    assert.equal(neoForgePrefixFor('26.1.1'), '26.1.1.');
    assert.equal(neoForgePrefixFor('1.20.1'), null, 'NeoForge 1.20.1 es otro artefacto');
    assert.equal(neoForgePrefixFor('1.19.2'), null);
});

test('neoForgeVersionsForMc filtra, ordena y recomienda la estable más reciente', () => {
    const all = ['21.0.10', '21.1.5', '21.1.77', '21.1.80-beta', '21.1.9', '20.4.237', '21.10.1'];
    const list = neoForgeVersionsForMc(all, '1.21.1');
    assert.deepEqual(list.map((v) => v.version), ['21.1.80-beta', '21.1.77', '21.1.9', '21.1.5']);
    assert.equal(list.find((v) => v.recommended).version, '21.1.77');
    assert.deepEqual(neoForgeVersionsForMc(all, '1.21').map((v) => v.version), ['21.0.10']);
    assert.deepEqual(neoForgeVersionsForMc(['21.2.1-beta'], '1.21.2')[0], { version: '21.2.1-beta', recommended: true, stable: false });
    assert.deepEqual(neoForgeVersionsForMc(all, '1.20.1'), []);
});

test('quiltVersionsFromMeta recomienda la estable más reciente', () => {
    const list = quiltVersionsFromMeta([
        { loader: { version: '0.27.0-beta.1' } },
        { loader: { version: '0.26.4' } },
        { loader: { version: '0.26.3' } }
    ]);
    assert.deepEqual(list.map((v) => [v.version, v.recommended]), [['0.27.0-beta.1', false], ['0.26.4', true], ['0.26.3', false]]);
    assert.deepEqual(quiltVersionsFromMeta(null), []);
});

test('Quilt acepta mods de Fabric en Modrinth; vanilla no filtra por loader', () => {
    assert.deepEqual(modrinthLoadersFor('quilt'), ['quilt', 'fabric']);
    assert.deepEqual(modrinthLoadersFor('neoforge'), ['neoforge']);
    assert.deepEqual(modrinthLoadersFor('vanilla'), []);
    assert.equal(isSupportedLoader('neoforge'), true);
    assert.equal(isSupportedLoader('liteloader'), false);
});
