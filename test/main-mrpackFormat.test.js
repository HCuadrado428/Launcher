// Formato .mrpack: loader/dependencias, rutas permitidas y descargas.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../main/mrpackFormat');

test('loader y versión desde "dependencies" y al revés', () => {
    assert.deepEqual(m.loaderFromDependencies({ minecraft: '1.21.1', 'fabric-loader': '0.16.5' }), { loader: 'fabric', loaderVersion: '0.16.5' });
    assert.deepEqual(m.loaderFromDependencies({ minecraft: '1.21.1', neoforge: '21.1.77' }), { loader: 'neoforge', loaderVersion: '21.1.77' });
    assert.deepEqual(m.loaderFromDependencies({ minecraft: '1.21.1', 'quilt-loader': '0.26.4' }), { loader: 'quilt', loaderVersion: '0.26.4' });
    assert.deepEqual(m.loaderFromDependencies({ minecraft: '1.21.1' }), { loader: 'vanilla', loaderVersion: '' });
    assert.deepEqual(m.dependenciesFor('1.20.1', 'forge', '47.2.0'), { minecraft: '1.20.1', forge: '47.2.0' });
    assert.deepEqual(m.dependenciesFor('1.21.1', 'vanilla', ''), { minecraft: '1.21.1' });
});

test('loaderVersionFromId entiende los ids que instala @xmcl', () => {
    assert.equal(m.loaderVersionFromId('fabric', '1.21.1-fabric0.16.5'), '0.16.5');
    assert.equal(m.loaderVersionFromId('quilt', '1.21.1-quilt0.26.4'), '0.26.4');
    assert.equal(m.loaderVersionFromId('forge', '1.20.1-forge-47.2.0'), '47.2.0');
    assert.equal(m.loaderVersionFromId('neoforge', 'neoforge-21.1.77'), '21.1.77');
    assert.equal(m.loaderVersionFromId('fabric', null), '');
});

test('solo se descargan archivos https de los dominios del formato', () => {
    assert.equal(m.isAllowedMrpackDownload('https://cdn.modrinth.com/data/AANobbMI/versions/x/sodium.jar'), true);
    assert.equal(m.isAllowedMrpackDownload('https://github.com/u/r/releases/download/v1/mod.jar'), true);
    assert.equal(m.isAllowedMrpackDownload('http://cdn.modrinth.com/x.jar'), false);
    assert.equal(m.isAllowedMrpackDownload('https://evil.example.com/x.jar'), false);
    assert.equal(m.isAllowedMrpackDownload('no es una url'), false);
});

test('classifyPackPath acepta mods, resource packs y config, e ignora el resto', () => {
    assert.deepEqual(m.classifyPackPath('mods/sodium.jar'), { kind: 'mod', fileName: 'sodium.jar' });
    assert.deepEqual(m.classifyPackPath('resourcepacks/faithful.zip'), { kind: 'resourcepack', fileName: 'faithful.zip' });
    assert.deepEqual(m.classifyPackPath('config/sodium-options.json'), { kind: 'config', relPath: 'config/sodium-options.json' });
    assert.deepEqual(m.classifyPackPath('options.txt'), { kind: 'config', relPath: 'options.txt' });
    for (const ignored of ['shaderpacks/bsl.zip', 'mods/sub/x.jar', '../mods/x.jar', 'mods/x.exe', 'kubejs/server.js', 'mods/..']) {
        assert.equal(m.classifyPackPath(ignored), null, `debería ignorar ${ignored}`);
    }
});

test('overrideRelPath distingue overrides/ y client-overrides/', () => {
    assert.deepEqual(m.overrideRelPath('overrides/config/a.json'), { relPath: 'config/a.json', clientOnly: false });
    assert.deepEqual(m.overrideRelPath('client-overrides/options.txt'), { relPath: 'options.txt', clientOnly: true });
    assert.equal(m.overrideRelPath('modrinth.index.json'), null);
    assert.equal(m.overrideRelPath('server-overrides/x'), null);
});

test('validateIndex exige un índice de Minecraft con formato 1', () => {
    assert.ok(m.validateIndex({ formatVersion: 1, game: 'minecraft', dependencies: { minecraft: '1.21.1' }, files: [] }));
    assert.throws(() => m.validateIndex({ formatVersion: 2, game: 'minecraft', dependencies: { minecraft: '1' }, files: [] }));
    assert.throws(() => m.validateIndex({ formatVersion: 1, game: 'minecraft', dependencies: {}, files: [] }));
    assert.throws(() => m.validateIndex(null));
});
