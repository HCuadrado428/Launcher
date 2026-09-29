// Detección de instancias de la app de CurseForge: versión y loader de su
// minecraftinstance.json, mods identificados en Modrinth por sha1.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-scan-'));
const originalLoad = Module._load;
Module._load = function (request) {
    if (request === 'electron') return { app: { getPath: (name) => path.join(homeDir, name === 'home' ? '' : name) } };
    return originalLoad.apply(this, arguments);
};
const { findCurseForgeInstances } = require('../main/localScan');
Module._load = originalLoad;

const sha1 = (data) => crypto.createHash('sha1').update(data).digest('hex');

test('una instancia de CurseForge se importa con su loader y los mods que están en Modrinth', async () => {
    const instance = path.join(homeDir, 'curseforge', 'minecraft', 'Instances', 'Mi Pack');
    fs.mkdirSync(path.join(instance, 'mods'), { recursive: true });
    fs.writeFileSync(path.join(instance, 'minecraftinstance.json'), JSON.stringify({
        name: 'Mi Pack', gameVersion: '1.20.1', baseModLoader: { name: 'forge-47.2.0' }
    }));
    fs.writeFileSync(path.join(instance, 'mods', 'jei.jar'), 'jei');
    fs.writeFileSync(path.join(instance, 'mods', 'exclusivo-cf.jar'), 'solo en curseforge');
    fs.writeFileSync(path.join(instance, 'mods', 'desactivado.jar.disabled'), 'x');

    globalThis.fetch = async (url, init) => {
        const { hashes } = JSON.parse(init.body);
        assert.equal(hashes.length, 2);
        return new Response(JSON.stringify({ [sha1('jei')]: { id: 'V-jei', project_id: 'P-jei', loaders: ['forge'], game_versions: ['1.20.1'] } }));
    };

    const [found] = await findCurseForgeInstances();
    assert.equal(found.source, 'curseforge');
    assert.equal(found.name, 'Mi Pack');
    assert.equal(found.mcVersion, '1.20.1');
    assert.equal(found.loader, 'forge');
    assert.equal(found.loaderVersion, '47.2.0');
    assert.equal(found.modCount, 2);
    assert.equal(found.resolvedCount, 1);
    assert.equal(found.importable, true);
    assert.deepEqual(found.resolvedMods.map((m) => m.projectId), ['P-jei']);
    assert.deepEqual(found.unresolvedFiles, ['exclusivo-cf.jar']);
});

test.after(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
});
