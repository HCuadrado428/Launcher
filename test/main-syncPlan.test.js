// computeSyncPlan decide qué borrar/descargar y si reinstalar el loader al
// sincronizar un modpack. Es lógica pura: se prueba sin disco ni red.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeSyncPlan } = require('../main/syncPlan');

const mod = (id, sha1, extra = {}) => ({ id, filename: `${id}.jar`, sha1, filesize: 100, ...extra });

test('primera sincronización: descarga todo, instala el loader y suma los tamaños', () => {
    const plan = computeSyncPlan({
        manifest: { mc_version: '1.20.1', loader: 'fabric', loader_version: '0.15.0', mods: [mod('a', '1'), mod('b', '2')] },
        localMeta: { mods: [] }
    });
    assert.deepEqual(plan.toDownload.map((m) => m.id), ['a', 'b']);
    assert.deepEqual(plan.toDelete, []);
    assert.equal(plan.needsLoaderInstall, true);
    assert.equal(plan.totalDownloadBytes, 200);
    assert.equal(plan.remoteMods[0].type, 'mod', 'los mods sin "type" se consideran mods');
});

test('solo descarga lo que cambió y borra lo que ya no está', () => {
    const plan = computeSyncPlan({
        manifest: { mc_version: '1.20.1', loader: 'vanilla', mods: [mod('a', '1'), mod('b', 'nuevo')] },
        localMeta: { mods: [mod('a', '1'), mod('b', 'viejo'), mod('c', '3')] }
    });
    assert.deepEqual(plan.toDownload.map((m) => m.id), ['b']);
    assert.deepEqual(plan.toDelete.map((m) => m.id), ['c']);
    assert.equal(plan.needsLoaderInstall, false);
    assert.equal(plan.loaderVersionId, null);
});

test('un mod opcional desmarcado por el jugador se quita, uno sin elegir se incluye', () => {
    const plan = computeSyncPlan({
        manifest: { loader: 'vanilla', mods: [mod('opt1', '1', { optional: true }), mod('opt2', '2', { optional: true })] },
        localMeta: { mods: [mod('opt1', '1', { optional: true })] },
        optionalChoices: { opt1: false }
    });
    assert.deepEqual(plan.remoteMods.map((m) => m.id), ['opt2']);
    assert.deepEqual(plan.toDelete.map((m) => m.id), ['opt1']);
    assert.deepEqual(plan.toDownload.map((m) => m.id), ['opt2']);
});

test('el loader no se reinstala si nada cambió y su version.json sigue en disco', () => {
    const localMeta = { mods: [], loader: 'forge', mc_version: '1.20.1', requested_loader_version: '47.2.0', loader_version_id: '1.20.1-forge-47.2.0' };
    const manifest = { mc_version: '1.20.1', loader: 'forge', loader_version: '47.2.0', mods: [] };

    const unchanged = computeSyncPlan({ manifest, localMeta, versionJsonExists: () => true });
    assert.equal(unchanged.needsLoaderInstall, false);
    assert.equal(unchanged.loaderVersionId, '1.20.1-forge-47.2.0');

    assert.equal(computeSyncPlan({ manifest, localMeta, versionJsonExists: () => false }).needsLoaderInstall, true);
    assert.equal(computeSyncPlan({ manifest: { ...manifest, loader_version: '47.3.0' }, localMeta }).needsLoaderInstall, true);
    assert.equal(computeSyncPlan({ manifest: { ...manifest, mc_version: '1.20.4' }, localMeta }).needsLoaderInstall, true);
});
