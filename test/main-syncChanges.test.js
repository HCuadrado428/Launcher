// Novedades tras sincronizar, cuándo copiar los mundos y RAM recomendada.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeSyncChanges, changesRiskWorlds, recommendedMemoryGb } = require('../main/syncChanges');

const mod = (id, filename, type = 'mod') => ({ id, filename, type });
const localMeta = { mc_version: '1.21.1', loader: 'fabric', mods: [mod(1, 'a-1.jar'), mod(2, 'b.jar'), mod(3, 'pack.zip', 'resourcepack')] };

test('resume mods añadidos, actualizados y quitados', () => {
    const plan = { loader: 'fabric', toDownload: [mod(1, 'a-2.jar'), mod(4, 'c.jar')], toDelete: [mod(2, 'b.jar')] };
    assert.deepEqual(summarizeSyncChanges(plan, localMeta, { mc_version: '1.21.1' }), {
        added: ['c.jar'], updated: ['a-2.jar'], removed: ['b.jar'], versionChanged: false, mcVersion: '1.21.1', loader: 'fabric'
    });
});

test('sin cambios, o en la primera sincronización, no hay novedades', () => {
    const empty = { loader: 'fabric', toDownload: [], toDelete: [] };
    assert.equal(summarizeSyncChanges(empty, localMeta, { mc_version: '1.21.1' }), null);
    assert.equal(summarizeSyncChanges({ loader: 'fabric', toDownload: [mod(1, 'a.jar')], toDelete: [] }, { mods: [] }, { mc_version: '1.21.1' }), null);
});

test('se copian los mundos si se quitan mods o cambia la versión, no por resource packs', () => {
    const removeMod = { loader: 'fabric', toDownload: [], toDelete: [mod(2, 'b.jar')] };
    const removePack = { loader: 'fabric', toDownload: [], toDelete: [mod(3, 'pack.zip', 'resourcepack')] };
    const addOnly = { loader: 'fabric', toDownload: [mod(9, 'nuevo.jar')], toDelete: [] };
    assert.equal(changesRiskWorlds(removeMod, localMeta, { mc_version: '1.21.1' }), true);
    assert.equal(changesRiskWorlds(removePack, localMeta, { mc_version: '1.21.1' }), false);
    assert.equal(changesRiskWorlds(addOnly, localMeta, { mc_version: '1.21.1' }), false);
    assert.equal(changesRiskWorlds({ loader: 'fabric', toDownload: [], toDelete: [] }, localMeta, { mc_version: '1.21.4' }), true);
    assert.equal(changesRiskWorlds({ loader: 'neoforge', toDownload: [], toDelete: [] }, localMeta, { mc_version: '1.21.1' }), true);
});

test('RAM recomendada según los mods y la RAM del sistema', () => {
    assert.equal(recommendedMemoryGb(0, 16), 2);
    assert.equal(recommendedMemoryGb(40, 16), 4);
    assert.equal(recommendedMemoryGb(100, 16), 6);
    assert.equal(recommendedMemoryGb(200, 16), 8);
    assert.equal(recommendedMemoryGb(400, 32), 10);
    assert.equal(recommendedMemoryGb(400, 8), 6, 'deja 2 GB para el sistema');
    assert.equal(recommendedMemoryGb(400, 3), 2, 'nunca menos de 2 GB');
    assert.equal(recommendedMemoryGb(100, null), 6);
});
