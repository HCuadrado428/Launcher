// Lanza de verdad con @xmcl/core una "versión de Minecraft" mínima creada
// en el momento: un .jar cuyo main imprime los argumentos y sale con un
// código conocido. Comprueba que el proceso arranca, que las variables de
// la línea de comandos se sustituyen (usuario, uuid, xuid, token) y que el
// watcher entrega el código de salida. Necesita un JDK (javac y jar); si no
// lo hay, se salta.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function hasJdk() {
    try {
        execFileSync('javac', ['-version'], { stdio: 'ignore' });
        execFileSync('jar', ['--version'], { stdio: 'ignore' });
        return true;
    } catch (err) {
        return false;
    }
}

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

function createFakeVersion(root, versionId) {
    const versionDir = path.join(root, 'versions', versionId);
    const buildDir = path.join(root, 'build');
    fs.mkdirSync(versionDir, { recursive: true });
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'FakeMain.java'), `
public class FakeMain {
    public static void main(String[] args) {
        System.out.println("ARGS " + String.join(" ", args));
        System.exit(3);
    }
}
`);
    execFileSync('javac', ['-d', buildDir, path.join(buildDir, 'FakeMain.java')]);
    execFileSync('jar', ['cf', path.join(versionDir, `${versionId}.jar`), '-C', buildDir, 'FakeMain.class']);
    fs.writeFileSync(path.join(versionDir, `${versionId}.json`), JSON.stringify({
        id: versionId,
        type: 'release',
        mainClass: 'FakeMain',
        assets: 'fake',
        libraries: [],
        arguments: {
            jvm: ['-cp', '${classpath}'],
            game: ['--username', '${auth_player_name}', '--uuid', '${auth_uuid}', '--accessToken', '${auth_access_token}', '--xuid', '${auth_xuid}', '--clientId', '${clientid}', '--userType', '${user_type}']
        }
    }));
}

test('@xmcl/core lanza el juego con nuestras opciones y entrega el código de salida', { skip: !hasJdk() && 'sin JDK' }, async () => {
    const { buildLaunchOptions, startMinecraft, gameCredentials, legacyOfflineUuid } = loadGameLauncher();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-real-launch-'));
    try {
        createFakeVersion(root, 'fake-1.0');
        const options = buildLaunchOptions({
            root,
            versionId: 'fake-1.0',
            javaPath: 'java',
            memory: { max: '1G', min: '256M' },
            customArgs: [],
            credentials: gameCredentials({ type: 'microsoft', username: 'Steve' }, { name: 'Steve', uuid: 'uuid-1', access_token: 'tok-1', meta: { xuid: 'xuid-1' } })
        });
        const { child, watcher } = await startMinecraft(options);

        let output = '';
        child.stdout.on('data', (chunk) => { output += chunk.toString(); });
        const exit = await new Promise((resolve) => watcher.once('minecraft-exit', resolve));

        assert.equal(exit.code, 3);
        assert.match(output, /--username Steve --uuid uuid-1 --accessToken tok-1 --xuid xuid-1 --clientId tok-1 --userType msa/);

        // Y una cuenta offline, con el UUID de siempre.
        const offline = await startMinecraft(buildLaunchOptions({ ...options, root, versionId: 'fake-1.0', javaPath: 'java', memory: {}, customArgs: [], credentials: gameCredentials({ type: 'offline', username: 'Alex' }) }));
        let offlineOutput = '';
        offline.child.stdout.on('data', (chunk) => { offlineOutput += chunk.toString(); });
        await new Promise((resolve) => offline.watcher.once('minecraft-exit', resolve));
        assert.match(offlineOutput, new RegExp(`--uuid ${legacyOfflineUuid('Alex')} `));
        assert.match(offlineOutput, /--userType legacy/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('si Java no existe, startMinecraft falla con un error en vez de quedarse colgado', { skip: !hasJdk() && 'sin JDK' }, async () => {
    const { buildLaunchOptions, startMinecraft, gameCredentials } = loadGameLauncher();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-real-launch-'));
    try {
        createFakeVersion(root, 'fake-1.0');
        const options = buildLaunchOptions({
            root, versionId: 'fake-1.0', javaPath: path.join(root, 'no-existe', 'java'), memory: {}, customArgs: [],
            credentials: gameCredentials({ type: 'offline', username: 'Alex' })
        });
        await assert.rejects(startMinecraft(options), /ENOENT/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
