// Exportar una instalación local a .mrpack y volver a importarlo como
// modpack nuevo, con Modrinth y el backend simulados por un fetch falso.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-mrpack-'));
fs.mkdirSync(path.join(baseDir, 'userData'), { recursive: true });

const originalLoad = Module._load;
Module._load = function (request) {
    if (request === 'electron') {
        return { app: { getPath: (name) => path.join(baseDir, name) }, safeStorage: { isEncryptionAvailable: () => false } };
    }
    return originalLoad.apply(this, arguments);
};
const { saveConfig } = require('../main/config');
const { instanceDir } = require('../main/paths');
const { exportMrpack, importMrpack } = require('../main/mrpack');
const { readZipEntries } = require('../main/zipRead');
Module._load = originalLoad;

saveConfig({ session: { token: 'jwt' } });
console.warn = () => {};

const sha1 = (data) => crypto.createHash('sha1').update(data).digest('hex');
const SODIUM = Buffer.from('sodium jar');
const CUSTOM = Buffer.from('mod subido a mano');

const calls = [];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const key = `${method} ${String(url).replace(/^https:\/\/[^/]+/, '')}`;
    calls.push({ key, body: init.body });
    if (key === 'POST /v2/version_files') {
        const { hashes } = JSON.parse(init.body);
        return json(hashes.includes(sha1(SODIUM))
            ? { [sha1(SODIUM)]: { id: 'V-sodium', project_id: 'P-sodium', files: [{ url: 'https://cdn.modrinth.com/data/P/versions/V/sodium.jar', size: SODIUM.length, hashes: { sha1: sha1(SODIUM), sha512: 'x'.repeat(128) } }] } }
            : {});
    }
    if (key === 'POST /api/modpacks') return json({ id: 'nuevo', name: JSON.parse(init.body).name });
    if (key.startsWith('POST /api/modpacks/nuevo/')) return json({ ok: true });
    if (key.startsWith('PUT /api/modpacks/nuevo/config')) return json({ ok: true });
    return json({ error: `no simulado: ${key}` }, 404);
};

test('exportar a .mrpack y reimportarlo', async () => {
    // Instalación local ya sincronizada de un modpack Fabric.
    const dir = instanceDir('pack1');
    fs.mkdirSync(path.join(dir, 'mods'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'mods', 'sodium.jar'), SODIUM);
    fs.writeFileSync(path.join(dir, 'mods', 'custom.jar'), CUSTOM);
    fs.writeFileSync(path.join(dir, 'config', 'sodium-options.json'), '{"a":1}');
    fs.writeFileSync(path.join(dir, 'options.txt'), 'fov:90');
    fs.writeFileSync(path.join(dir, '.launcher-meta.json'), JSON.stringify({
        version_hash: 'abcdef1234567890',
        loader: 'fabric',
        mc_version: '1.21.1',
        requested_loader_version: '',
        loader_version_id: '1.21.1-fabric0.16.5',
        mods: [
            { id: 1, filename: 'sodium.jar', sha1: sha1(SODIUM), type: 'mod' },
            { id: 2, filename: 'custom.jar', sha1: sha1(CUSTOM), type: 'mod' }
        ]
    }));

    const mrpackPath = path.join(baseDir, 'Mi Pack.mrpack');
    const exported = await exportMrpack('pack1', 'Mi Pack', mrpackPath);
    assert.deepEqual(exported, { linked: 1, included: 3 });

    const entries = await readZipEntries(mrpackPath, { accept: () => true });
    const names = entries.map((e) => e.name).sort();
    assert.deepEqual(names, ['modrinth.index.json', 'overrides/config/sodium-options.json', 'overrides/mods/custom.jar', 'overrides/options.txt']);
    const index = JSON.parse(entries.find((e) => e.name === 'modrinth.index.json').data);
    assert.deepEqual(index.dependencies, { minecraft: '1.21.1', 'fabric-loader': '0.16.5' });
    assert.equal(index.files.length, 1);
    assert.equal(index.files[0].path, 'mods/sodium.jar');
    assert.deepEqual(index.files[0].downloads, ['https://cdn.modrinth.com/data/P/versions/V/sodium.jar']);

    calls.length = 0;
    const imported = await importMrpack(mrpackPath);
    assert.equal(imported.modpack.id, 'nuevo');
    assert.equal(imported.fromModrinth, 1);
    assert.equal(imported.uploaded, 1);
    assert.equal(imported.skipped, 0);
    assert.equal(imported.configShared, true);

    const created = JSON.parse(calls.find((c) => c.key === 'POST /api/modpacks').body);
    assert.deepEqual(created, { name: 'Mi Pack', mc_version: '1.21.1', loader: 'fabric', loader_version: '0.16.5' });
    const fromModrinth = JSON.parse(calls.find((c) => c.key.endsWith('/mods/from-modrinth')).body);
    assert.deepEqual(fromModrinth, { project_id: 'P-sodium', version_id: 'V-sodium', type: 'mod' });
    assert.ok(calls.some((c) => c.key === 'POST /api/modpacks/nuevo/mods'), 'el mod sin Modrinth se sube');
    assert.ok(calls.some((c) => c.key === 'PUT /api/modpacks/nuevo/config'), 'la config se comparte');
});

test('un archivo que no es un .mrpack da un error claro', async () => {
    const bad = path.join(baseDir, 'malo.mrpack');
    fs.writeFileSync(bad, 'no es un zip');
    await assert.rejects(importMrpack(bad));

    const yazl = require('yazl');
    const zip = new yazl.ZipFile();
    zip.addBuffer(Buffer.from('{"game":"otro"}'), 'modrinth.index.json');
    const { writeZip } = require('../main/zip');
    const wrong = path.join(baseDir, 'otro.mrpack');
    await writeZip(zip, wrong);
    await assert.rejects(importMrpack(wrong), /no es un \.mrpack válido/);
});

test.after(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
});
