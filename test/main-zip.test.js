// addDirToZip recorre carpetas de forma asíncrona (exportar mundos puede
// tener miles de archivos) y writeZip deja el .zip entero en disco.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const yazl = require('yazl');
const yauzl = require('yauzl');
const { addDirToZip, writeZip } = require('../main/zip');

function listZipEntries(zipPath) {
    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
            if (err) return reject(err);
            const names = [];
            zipfile.on('entry', (entry) => { names.push(entry.fileName); zipfile.readEntry(); });
            zipfile.on('end', () => resolve(names.sort()));
            zipfile.on('error', reject);
            zipfile.readEntry();
        });
    });
}

test('addDirToZip añade todo con rutas relativas y cuenta los archivos', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-zip-'));
    try {
        const saves = path.join(dir, 'saves');
        fs.mkdirSync(path.join(saves, 'Mundo 1', 'region'), { recursive: true });
        fs.writeFileSync(path.join(saves, 'Mundo 1', 'level.dat'), 'x');
        fs.writeFileSync(path.join(saves, 'Mundo 1', 'region', 'r.0.0.mca'), 'y');

        const zipfile = new yazl.ZipFile();
        const count = await addDirToZip(zipfile, saves, 'saves');
        assert.equal(count, 2);
        assert.equal(await addDirToZip(zipfile, path.join(dir, 'no-existe'), 'x'), 0);

        const zipPath = path.join(dir, 'out.zip');
        await writeZip(zipfile, zipPath);
        assert.deepEqual(await listZipEntries(zipPath), ['saves/Mundo 1/level.dat', 'saves/Mundo 1/region/r.0.0.mca']);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
