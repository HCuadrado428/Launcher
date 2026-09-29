// Tests de main/httpUtils.js: construcción segura de rutas de la API,
// política de reintentos y la descarga a disco con sha1 que usa la
// sincronización de modpacks (contra un servidor HTTP local de verdad).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const {
    downloadToFile,
    encodePathSegment,
    apiPath,
    isSafeToRetry,
    isAllowedBackendUrl,
    normalizeImageContentType
} = require('../main/httpUtils');

test('apiPath escapa cada valor como un único segmento de la URL', () => {
    assert.equal(apiPath`/api/modpacks/${'abc'}/mods/${42}`, '/api/modpacks/abc/mods/42');
    // Un "token" que intenta llamar a otro endpoint queda como un segmento
    // literal: fetch ya no puede resolver los ".." ni cortar en el "?".
    assert.equal(
        apiPath`/api/invites/${'../modpacks/X/leave?x='}/redeem`,
        '/api/invites/..%2Fmodpacks%2FX%2Fleave%3Fx%3D/redeem'
    );
});

test('encodePathSegment rechaza "." / ".." y valores vacíos o que no son texto', () => {
    for (const bad of ['', '.', '..', null, undefined, {}, NaN]) {
        assert.throws(() => encodePathSegment(bad), /no válido/, `debería rechazar ${JSON.stringify(bad)}`);
    }
    assert.equal(encodePathSegment('...'), '...');
});

test('isSafeToRetry: GET/PUT siempre, POST solo si no llegó a conectar', () => {
    const connectErr = new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    const timeoutErr = new Error('timeout', { cause: { name: 'AbortError' } });
    assert.equal(isSafeToRetry('GET', timeoutErr), true);
    assert.equal(isSafeToRetry('put', timeoutErr), true);
    assert.equal(isSafeToRetry('POST', connectErr), true);
    assert.equal(isSafeToRetry('POST', timeoutErr), false);
    assert.equal(isSafeToRetry('DELETE', timeoutErr), false);
});

test('isAllowedBackendUrl solo acepta https (o http a localhost)', () => {
    assert.equal(isAllowedBackendUrl('https://serverminecraft-production.up.railway.app'), true);
    assert.equal(isAllowedBackendUrl('http://localhost:3000'), true);
    assert.equal(isAllowedBackendUrl('http://127.0.0.1:3000'), true);
    assert.equal(isAllowedBackendUrl('http://evil.example.com'), false);
    assert.equal(isAllowedBackendUrl('file:///etc/passwd'), false);
    assert.equal(isAllowedBackendUrl('no es una url'), false);
});

test('normalizeImageContentType solo deja pasar tipos de imagen conocidos', () => {
    assert.equal(normalizeImageContentType('image/png'), 'image/png');
    assert.equal(normalizeImageContentType('IMAGE/JPEG; charset=binary'), 'image/jpeg');
    assert.equal(normalizeImageContentType('text/html'), null);
    assert.equal(normalizeImageContentType('image/png" onerror="alert(1)'), null);
    assert.equal(normalizeImageContentType(null), null);
});

// --- downloadToFile contra un servidor local ---

const FILE_BODY = Buffer.from('contenido de un mod de prueba'.repeat(1000));
const FILE_SHA1 = crypto.createHash('sha1').update(FILE_BODY).digest('hex');

function startServer(handler) {
    return new Promise((resolve) => {
        const server = http.createServer(handler);
        server.listen(0, '127.0.0.1', () => {
            resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
        });
    });
}

async function withServerAndDir(handler, fn) {
    const { server, baseUrl } = await startServer(handler);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-download-'));
    try {
        await fn(baseUrl, dir);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('downloadToFile guarda el archivo cuando el sha1 coincide', async () => {
    await withServerAndDir((req, res) => res.end(FILE_BODY), async (baseUrl, dir) => {
        const dest = path.join(dir, 'mod.jar');
        const sha1 = await downloadToFile(`${baseUrl}/mod.jar`, dest, { expectedSha1: FILE_SHA1 });
        assert.equal(sha1, FILE_SHA1);
        assert.deepEqual(fs.readFileSync(dest), FILE_BODY);
        assert.deepEqual(fs.readdirSync(dir), ['mod.jar'], 'no debe quedar el .part');
    });
});

test('downloadToFile no deja ni el archivo ni el .part si el sha1 no coincide', async () => {
    await withServerAndDir((req, res) => res.end(FILE_BODY), async (baseUrl, dir) => {
        const dest = path.join(dir, 'mod.jar');
        await assert.rejects(
            downloadToFile(`${baseUrl}/mod.jar`, dest, { expectedSha1: '0'.repeat(40) }),
            (err) => err.code === 'SHA1_MISMATCH'
        );
        assert.deepEqual(fs.readdirSync(dir), []);
    });
});

test('downloadToFile no pisa un archivo bueno ya existente si la descarga falla', async () => {
    await withServerAndDir((req, res) => res.end('corrupto'), async (baseUrl, dir) => {
        const dest = path.join(dir, 'mod.jar');
        fs.writeFileSync(dest, 'versión anterior');
        await assert.rejects(downloadToFile(`${baseUrl}/mod.jar`, dest, { expectedSha1: FILE_SHA1 }));
        assert.equal(fs.readFileSync(dest, 'utf-8'), 'versión anterior');
    });
});

test('downloadToFile expone el estado HTTP en err.status', async () => {
    await withServerAndDir((req, res) => { res.statusCode = 404; res.end('no'); }, async (baseUrl, dir) => {
        await assert.rejects(
            downloadToFile(`${baseUrl}/nope.jar`, path.join(dir, 'nope.jar')),
            (err) => err.status === 404
        );
        assert.deepEqual(fs.readdirSync(dir), []);
    });
});

test('downloadToFile corta una descarga que deja de mandar datos', async () => {
    const handler = (req, res) => {
        res.writeHead(200, { 'Content-Length': String(FILE_BODY.length) });
        res.write(FILE_BODY.subarray(0, 100)); // y se queda colgado
    };
    await withServerAndDir(handler, async (baseUrl, dir) => {
        await assert.rejects(
            downloadToFile(`${baseUrl}/stall.jar`, path.join(dir, 'stall.jar'), { idleTimeoutMs: 200 }),
            /tardado demasiado/
        );
        assert.deepEqual(fs.readdirSync(dir), []);
    });
});

test('downloadToFile no corta una descarga lenta que sigue mandando datos', async () => {
    const handler = (req, res) => {
        res.writeHead(200, { 'Content-Length': String(FILE_BODY.length) });
        const chunks = [];
        for (let i = 0; i < FILE_BODY.length; i += 5000) chunks.push(FILE_BODY.subarray(i, i + 5000));
        const sendNext = () => {
            if (chunks.length === 0) return res.end();
            res.write(chunks.shift());
            setTimeout(sendNext, 60);
        };
        sendNext();
    };
    await withServerAndDir(handler, async (baseUrl, dir) => {
        // Tarda en total bastante más que el timeout, pero nunca está
        // inactiva más de ~60 ms seguidos.
        const dest = path.join(dir, 'slow.jar');
        await downloadToFile(`${baseUrl}/slow.jar`, dest, { expectedSha1: FILE_SHA1, idleTimeoutMs: 250 });
        assert.deepEqual(fs.readFileSync(dest), FILE_BODY);
    });
});
