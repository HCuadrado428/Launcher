// Tests de las utilidades puras de main/ (sin depender de Electron). Cubren
// sobre todo comparación de versiones (usada tanto para elegir el Java más
// nuevo como para ordenar builds de Forge) y los helpers de concurrencia/
// hash que usa la sincronización de modpacks.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
    parseVersionFromDirName,
    compareVersionArrays,
    sha1File,
    runWithConcurrencyLimit,
    formatBytesMain,
    getFreeDiskSpaceBytes
} = require('../main/utils');

const { requiredJavaMajorFor } = require('../main/java');

test('parseVersionFromDirName extrae los números de un nombre de carpeta', () => {
    assert.deepEqual(parseVersionFromDirName('jdk-21.0.1'), [21, 0, 1]);
    assert.deepEqual(parseVersionFromDirName('1.20.4'), [1, 20, 4]);
    assert.deepEqual(parseVersionFromDirName('sin-numeros'), [0]);
});

test('compareVersionArrays ordena versiones correctamente', () => {
    assert.ok(compareVersionArrays([21, 0, 1], [17, 0, 0]) > 0);
    assert.ok(compareVersionArrays([1, 20, 1], [1, 20, 4]) < 0);
    assert.equal(compareVersionArrays([1, 20], [1, 20, 0]), 0);
});

test('requiredJavaMajorFor sigue los requisitos oficiales de Mojang', () => {
    assert.equal(requiredJavaMajorFor('1.16.5'), 8);
    assert.equal(requiredJavaMajorFor('1.17.1'), 16);
    assert.equal(requiredJavaMajorFor('1.20.4'), 17);
    assert.equal(requiredJavaMajorFor('1.21.1'), 21);
});

test('formatBytesMain da un formato legible', () => {
    assert.equal(formatBytesMain(500), '500 B');
    assert.equal(formatBytesMain(1024 * 1024 * 5), '5.0 MB');
});

test('sha1File calcula el hash real de un archivo', async () => {
    const tmpFile = path.join(os.tmpdir(), `sha1-test-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'hola mundo');
    try {
        const hash = await sha1File(tmpFile);
        // sha1("hola mundo") calculado aparte, para no depender de que el
        // propio código bajo test también esté roto de la misma manera.
        assert.equal(hash, require('node:crypto').createHash('sha1').update('hola mundo').digest('hex'));
    } finally {
        fs.unlinkSync(tmpFile);
    }
});

test('runWithConcurrencyLimit procesa todos los elementos sin pasarse del límite', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    let active = 0;
    let maxActive = 0;
    const processed = [];

    await runWithConcurrencyLimit(items, 3, async (item) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        processed.push(item);
        active--;
    });

    assert.equal(processed.length, 20);
    assert.ok(maxActive <= 3, `nunca deberían estar más de 3 en paralelo, hubo ${maxActive}`);
    assert.deepEqual([...processed].sort((a, b) => a - b), items);
});

test('getFreeDiskSpaceBytes devuelve un número para una ruta real', () => {
    const bytes = getFreeDiskSpaceBytes(os.tmpdir());
    assert.equal(typeof bytes, 'number');
    assert.ok(bytes > 0);
});
