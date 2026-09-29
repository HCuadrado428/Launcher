// Añadir mods con sus dependencias y actualizarlos: se simulan Modrinth y
// el backend con un fetch falso y se comprueba el orden de las llamadas.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-modupdates-'));
fs.mkdirSync(path.join(userDataDir, 'userData'), { recursive: true });

const originalLoad = Module._load;
Module._load = function (request) {
    if (request === 'electron') {
        return { app: { getPath: (name) => path.join(userDataDir, name) }, safeStorage: { isEncryptionAvailable: () => false } };
    }
    return originalLoad.apply(this, arguments);
};
const { saveConfig } = require('../main/config');
const { addModFromModrinth, updateMod } = require('../main/modUpdates');
Module._load = originalLoad;

saveConfig({ session: { token: 'jwt' } });

let calls = [];
let routes = {};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const key = `${method} ${String(url).replace(/^https:\/\/[^/]+/, '')}`;
    calls.push({ key, body: init.body ? JSON.parse(init.body) : undefined });
    for (const [pattern, handler] of Object.entries(routes)) {
        if (key.startsWith(pattern)) return handler(init);
    }
    return json({ error: `ruta no simulada: ${key}` }, 404);
};

beforeEach(() => {
    calls = [];
    routes = {};
});

const backendCalls = () => calls.filter((c) => c.key.includes('/api/modpacks/')).map((c) => c.key);

test('al añadir un mod se calculan las dependencias obligatorias que faltan', async () => {
    routes = {
        'GET /v2/project/P1/version': () => json([{ id: 'V1', project_id: 'P1', dependencies: [
            { project_id: 'P2', dependency_type: 'required' },
            { version_id: 'V3', dependency_type: 'required' },
            { project_id: 'P4', dependency_type: 'optional' }
        ] }]),
        'POST /api/modpacks/pack/mods/from-modrinth': () => json({ id: 'nuevo' }),
        'GET /api/modpacks/pack/manifest': () => json({ mods: [{ id: 'm1', sha1: 'aaa' }] }),
        'POST /v2/version_files': () => json({ aaa: { id: 'V3', project_id: 'P3' } }),
        'GET /v2/version/V3': () => json({ id: 'V3', project_id: 'P3' }),
        'GET /v2/projects': () => json([{ id: 'P2', title: 'Dependencia Dos' }])
    };
    const result = await addModFromModrinth({ id: 'pack', projectId: 'P1', mcVersion: '1.21.1', loader: 'fabric', projectType: 'mod' });

    assert.deepEqual(result.missingDependencies, [{ projectId: 'P2', title: 'Dependencia Dos' }]);
    assert.deepEqual(calls.find((c) => c.key.includes('from-modrinth')).body, { project_id: 'P1', version_id: 'V1', type: 'mod' });
});

const updateRoutes = (extra = {}) => ({
    'GET /api/modpacks/pack/manifest': () => json({ mods: [{ id: 'old', sha1: 'sha-old', type: 'mod' }] }),
    'POST /v2/version_files': () => json({ 'sha-old': { id: 'V-old', project_id: 'P1' } }),
    'GET /v2/project/P1/version': () => json([{ id: 'V-new', version_number: '2.0', files: [{ hashes: { sha1: 'sha-new' } }] }]),
    'DELETE /api/modpacks/pack/mods/old': () => json({ ok: true }),
    ...extra
});

test('actualizar: se añade la versión nueva y después se quita la vieja', async () => {
    routes = updateRoutes({ 'POST /api/modpacks/pack/mods/from-modrinth': () => json({ id: 'new' }) });
    const result = await updateMod({ id: 'pack', modId: 'old', mcVersion: '1.21.1', loader: 'fabric' });
    assert.deepEqual(result, { updated: true, version: '2.0' });
    assert.deepEqual(backendCalls().filter((k) => !k.endsWith('manifest')), [
        'POST /api/modpacks/pack/mods/from-modrinth',
        'DELETE /api/modpacks/pack/mods/old'
    ]);
});

test('actualizar: si el backend no admite dos versiones a la vez, quita la vieja primero', async () => {
    let attempts = 0;
    routes = updateRoutes({ 'POST /api/modpacks/pack/mods/from-modrinth': () => (++attempts === 1 ? json({ error: 'ya existe' }, 409) : json({ id: 'new' })) });
    const result = await updateMod({ id: 'pack', modId: 'old', mcVersion: '1.21.1', loader: 'fabric' });
    assert.equal(result.updated, true);
    assert.deepEqual(backendCalls().filter((k) => !k.endsWith('manifest')), [
        'POST /api/modpacks/pack/mods/from-modrinth',
        'DELETE /api/modpacks/pack/mods/old',
        'POST /api/modpacks/pack/mods/from-modrinth'
    ]);
});

test('actualizar: si la versión nueva falla, se vuelve a poner la anterior', async () => {
    let attempts = 0;
    routes = updateRoutes({
        'POST /api/modpacks/pack/mods/from-modrinth': () => {
            attempts++;
            if (attempts === 1) return json({ error: 'ya existe' }, 409);
            if (attempts === 2) return json({ error: 'roto' }, 500);
            return json({ id: 'restaurado' });
        }
    });
    await assert.rejects(updateMod({ id: 'pack', modId: 'old', mcVersion: '1.21.1', loader: 'fabric' }), /roto/);
    const posts = calls.filter((c) => c.key.includes('from-modrinth')).map((c) => c.body.version_id);
    assert.deepEqual(posts, ['V-new', 'V-new', 'V-old']);
});

test('actualizar: si ya es la última versión no toca nada', async () => {
    routes = updateRoutes({
        'GET /v2/project/P1/version': () => json([{ id: 'V-old', version_number: '1.0', files: [{ hashes: { sha1: 'sha-old' } }] }])
    });
    assert.deepEqual(await updateMod({ id: 'pack', modId: 'old', mcVersion: '1.21.1', loader: 'fabric' }), { updated: false });
    assert.ok(!calls.some((c) => c.key.includes('from-modrinth') || c.key.startsWith('DELETE')));
});

test.after(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
});
