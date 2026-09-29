// main/sharedConfig.js descomprime la config que comparte el dueño de un
// modpack dentro de la instancia de cada jugador. Solo debe escribir
// config/** y options.txt, y nunca a través de un enlace.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const yazl = require('yazl');

const { extractSharedConfigZip, sharedConfigEntryTarget } = require('../main/sharedConfig');

function buildZip(files, emptyDirs = []) {
    return new Promise((resolve, reject) => {
        const zip = new yazl.ZipFile();
        for (const [name, content] of Object.entries(files)) zip.addBuffer(Buffer.from(content), name);
        for (const dir of emptyDirs) zip.addEmptyDirectory(dir);
        const chunks = [];
        zip.outputStream.on('data', (chunk) => chunks.push(chunk));
        zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
        zip.outputStream.on('error', reject);
        zip.end();
    });
}

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ember-shared-config-'));
}

test('sharedConfigEntryTarget solo acepta config/** y options.txt', () => {
    assert.deepEqual(sharedConfigEntryTarget('options.txt'), { parts: ['options.txt'], isDirectory: false });
    assert.deepEqual(sharedConfigEntryTarget('config/sodium.json'), { parts: ['config', 'sodium.json'], isDirectory: false });
    assert.deepEqual(sharedConfigEntryTarget('config/'), { parts: ['config'], isDirectory: true });
    for (const bad of ['mods/evil.jar', 'libraries/x.jar', 'assets/a.png', 'config', 'options.txt/',
        'config/../mods/evil.jar', 'config//x', 'config/x:stream', 'saves/world/level.dat']) {
        assert.equal(sharedConfigEntryTarget(bad), null, `debería ignorar ${bad}`);
    }
});

test('extractSharedConfigZip escribe config/ y options.txt e ignora el resto', async () => {
    const dir = makeTempDir();
    try {
        const zip = await buildZip({
            'config/sodium.json': '{"a":1}',
            'config/sub/keys.txt': 'jump=space',
            'options.txt': 'fov:90',
            'mods/evil.jar': 'no',
            'libraries/com/x/x.jar': 'no'
        }, ['config/vacia']);

        const written = await extractSharedConfigZip(zip, dir);

        assert.equal(written, 3);
        assert.equal(fs.readFileSync(path.join(dir, 'config', 'sodium.json'), 'utf-8'), '{"a":1}');
        assert.equal(fs.readFileSync(path.join(dir, 'config', 'sub', 'keys.txt'), 'utf-8'), 'jump=space');
        assert.equal(fs.readFileSync(path.join(dir, 'options.txt'), 'utf-8'), 'fov:90');
        assert.ok(fs.statSync(path.join(dir, 'config', 'vacia')).isDirectory());
        assert.ok(!fs.existsSync(path.join(dir, 'mods')));
        assert.ok(!fs.existsSync(path.join(dir, 'libraries')));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('extractSharedConfigZip no escribe a través de una carpeta enlazada', async () => {
    const dir = makeTempDir();
    const outside = makeTempDir();
    try {
        fs.symlinkSync(outside, path.join(dir, 'config'), 'junction');
        const zip = await buildZip({ 'config/pwned.txt': 'x' });

        await assert.rejects(extractSharedConfigZip(zip, dir), /enlace/);
        assert.deepEqual(fs.readdirSync(outside), []);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
    }
});

test('extractSharedConfigZip sustituye un archivo enlazado en vez de escribir en su destino', async (t) => {
    const dir = makeTempDir();
    const outside = makeTempDir();
    try {
        const outsideFile = path.join(outside, 'importante.txt');
        fs.writeFileSync(outsideFile, 'original');
        fs.mkdirSync(path.join(dir, 'config'));
        try {
            fs.symlinkSync(outsideFile, path.join(dir, 'config', 'link.cfg'), 'file');
        } catch (err) {
            t.skip('este sistema no permite crear enlaces a archivos sin privilegios');
            return;
        }
        const zip = await buildZip({ 'config/link.cfg': 'nuevo' });

        await extractSharedConfigZip(zip, dir);

        assert.equal(fs.readFileSync(outsideFile, 'utf-8'), 'original');
        const linkPath = path.join(dir, 'config', 'link.cfg');
        assert.ok(!fs.lstatSync(linkPath).isSymbolicLink());
        assert.equal(fs.readFileSync(linkPath, 'utf-8'), 'nuevo');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
    }
});

test('extractSharedConfigZip rechaza algo que no es un zip', async () => {
    const dir = makeTempDir();
    try {
        await assert.rejects(extractSharedConfigZip(Buffer.from('esto no es un zip'), dir));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
