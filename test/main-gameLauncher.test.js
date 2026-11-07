// Partes puras de main/gameLauncher.js: credenciales y opciones que se le
// pasan a @xmcl/core para lanzar el juego.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const os = require('node:os');

function loadGameLauncher() {
    const originalLoad = Module._load;
    Module._load = function (request) {
        if (request === 'electron') return { app: { getPath: () => os.tmpdir() } };
        return originalLoad.apply(this, arguments);
    };
    try {
        return require('../main/gameLauncher');
    } finally {
        Module._load = originalLoad;
    }
}

const { legacyOfflineUuid, gameCredentials, memoryToMb, buildLaunchOptions } = loadGameLauncher();

test('legacyOfflineUuid da el mismo UUID que minecraft-launcher-core (uuid v3 DNS)', () => {
    // Valores calculados con uuid.v3(nombre, uuid.v3.DNS) antes de quitar la
    // librería: si cambiaran, los jugadores offline perderían su inventario
    // en los mundos que ya tenían.
    assert.equal(legacyOfflineUuid('Steve'), 'e9df5bd1-28bb-31c6-8eb0-4ad41f47d874');
    assert.equal(legacyOfflineUuid('E2E'), '2ed5c6a9-4629-3b5d-9b4a-e06c44b51df5');
    assert.equal(legacyOfflineUuid('Jugador'), '53c41940-f333-3652-b242-5e6153986004');
});

test('gameCredentials: Microsoft usa el token y el xuid; offline, el UUID de siempre', () => {
    const ms = gameCredentials({ type: 'microsoft', username: 'Steve' }, { name: 'Steve', uuid: 'abc', access_token: 'tok', meta: { xuid: '123' } });
    assert.deepEqual(ms, { name: 'Steve', uuid: 'abc', accessToken: 'tok', userType: 'msa', xuid: '123' });

    const offline = gameCredentials({ type: 'offline', username: 'Steve' });
    assert.equal(offline.uuid, legacyOfflineUuid('Steve'));
    assert.equal(offline.userType, 'legacy');
    assert.equal(offline.accessToken, offline.uuid.replace(/-/g, ''));
});

test('memoryToMb convierte "4G"/"2048M" y descarta lo demás', () => {
    assert.equal(memoryToMb('4G'), 4096);
    assert.equal(memoryToMb('2048M'), 2048);
    assert.equal(memoryToMb('mucho'), undefined);
});

test('buildLaunchOptions traduce memoria, argumentos, servidor y credenciales', () => {
    const credentials = { name: 'Steve', uuid: 'u', accessToken: 't', userType: 'msa', xuid: 'x' };
    const base = { root: '/mc', versionId: '1.21.1', javaPath: '/java', memory: { max: '6G', min: '2G' }, credentials };

    const plain = buildLaunchOptions({ ...base, customArgs: [] });
    assert.equal(plain.maxMemory, 6144);
    assert.equal(plain.minMemory, 2048);
    assert.equal(plain.extraJVMArgs, undefined, 'sin argumentos propios se usan los de @xmcl');
    assert.deepEqual(plain.gameProfile, { name: 'Steve', id: 'u' });
    assert.deepEqual(plain.features.ember_auth, { auth_xuid: 'x', clientid: 't' });
    assert.equal(plain.extraExecOption.windowsHide, true);

    const custom = buildLaunchOptions({ ...base, customArgs: ['-XX:+UseZGC'] });
    assert.deepEqual(custom.extraJVMArgs, ['-XX:+UseZGC']);

    const quick = buildLaunchOptions({ ...base, quickPlay: { type: 'multiplayer', identifier: 'mc.example.com' } });
    assert.equal(quick.quickPlayMultiplayer, 'mc.example.com');

    const legacy = buildLaunchOptions({ ...base, quickPlay: { type: 'legacy', identifier: 'mc.example.com:25570' } });
    assert.deepEqual(legacy.server, { ip: 'mc.example.com', port: 25570 });
});
