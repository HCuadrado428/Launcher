// Java automático: instala un runtime con el mismo formato que publica
// Mojang (índice por plataforma → manifiesto → archivos) desde un servidor
// local, y comprueba que queda ejecutable y que no se vuelve a descargar.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-java-runtime-'));

function loadJavaRuntime() {
    const originalLoad = Module._load;
    Module._load = function (request) {
        if (request === 'electron') return { app: { getPath: () => appDataDir } };
        return originalLoad.apply(this, arguments);
    };
    try {
        return require('../main/javaRuntime');
    } finally {
        Module._load = originalLoad;
    }
}

const JAVA_SCRIPT = '#!/bin/sh\necho \'openjdk version "21.0.3"\' 1>&2\n';
const RELEASE_TEXT = 'JAVA_VERSION="21.0.3"\n';
const sha1 = (text) => crypto.createHash('sha1').update(text).digest('hex');

function startFakeMojang() {
    let requests = 0;
    const server = http.createServer((req, res) => {
        requests++;
        const base = `http://127.0.0.1:${server.address().port}`;
        const javaRel = process.platform === 'win32' ? 'bin/java.exe' : 'bin/java';
        const manifestText = JSON.stringify({
            files: {
                bin: { type: 'directory' },
                [javaRel]: { type: 'file', executable: true, downloads: { raw: { url: `${base}/java`, sha1: sha1(JAVA_SCRIPT), size: JAVA_SCRIPT.length } } },
                release: { type: 'file', executable: false, downloads: { raw: { url: `${base}/release`, sha1: sha1(RELEASE_TEXT), size: RELEASE_TEXT.length } } }
            }
        });
        if (req.url === '/all.json') {
            const target = [{ availability: { group: 1, progress: 100 }, manifest: { url: `${base}/manifest.json`, sha1: sha1(manifestText), size: manifestText.length }, version: { name: '21.0.3', released: '2024-01-01' } }];
            const perPlatform = { 'java-runtime-test': target };
            const index = {};
            for (const key of ['linux', 'linux-i386', 'mac-os', 'mac-os-arm64', 'windows-x64', 'windows-x86', 'windows-arm64']) index[key] = perPlatform;
            res.end(JSON.stringify(index));
        } else if (req.url === '/manifest.json') {
            res.end(manifestText);
        } else if (req.url === '/java') {
            res.end(JAVA_SCRIPT);
        } else if (req.url === '/release') {
            res.end(RELEASE_TEXT);
        } else {
            res.statusCode = 404;
            res.end();
        }
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, requestCount: () => requests })));
}

test('ensureJavaRuntime instala el runtime una vez y lo deja ejecutable', async () => {
    const { ensureJavaRuntime, runtimeExecutablePath } = loadJavaRuntime();
    const { server, requestCount } = await startFakeMojang();
    const indexUrl = `http://127.0.0.1:${server.address().port}/all.json`;
    try {
        const progress = [];
        const javaPath = await ensureJavaRuntime('java-runtime-test', (done, total) => progress.push([done, total]), { indexUrl });

        assert.equal(javaPath, runtimeExecutablePath('java-runtime-test'));
        assert.equal(fs.readFileSync(javaPath, 'utf-8'), JAVA_SCRIPT);
        assert.equal(fs.readFileSync(path.join(path.dirname(path.dirname(javaPath)), 'release'), 'utf-8'), RELEASE_TEXT);
        if (process.platform !== 'win32') {
            assert.ok(fs.statSync(javaPath).mode & 0o111, 'el ejecutable debe tener permisos de ejecución');
        }

        const requestsAfterInstall = requestCount();
        assert.equal(await ensureJavaRuntime('java-runtime-test', null, { indexUrl }), javaPath);
        assert.equal(requestCount(), requestsAfterInstall, 'la segunda vez no debe descargar nada');
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});

test.after(() => {
    fs.rmSync(appDataDir, { recursive: true, force: true });
});
