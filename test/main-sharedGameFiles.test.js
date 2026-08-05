// main/sharedGameFiles.js enlaza assets/ y libraries/ de cada instancia
// contra un almacén compartido (VANILLA_ROOT), en vez de dejar que cada
// modpack descargue su propia copia de los mismos miles de archivos. Se
// mockea 'electron' (app.getPath) igual que en main-config.test.js, porque
// main/paths.js necesita app.getPath('appData') para calcular VANILLA_ROOT.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-launcher-shared-test-'));

function loadModuleWithMockedElectron() {
    const originalLoad = Module._load;
    let mod;
    Module._load = function (request, parent, isMain) {
        if (request === 'electron') return { app: { getPath: () => appDataDir } };
        return originalLoad.apply(this, arguments);
    };
    try {
        delete require.cache[require.resolve('../main/paths')];
        delete require.cache[require.resolve('../main/sharedGameFiles')];
        mod = require('../main/sharedGameFiles');
    } finally {
        Module._load = originalLoad;
    }
    return mod;
}

const { ensureSharedGameFilesLinked } = loadModuleWithMockedElectron();
const VANILLA_ROOT = path.join(appDataDir, '.milauncher');
const INSTANCES_DIR = path.join(VANILLA_ROOT, 'instances');

function isJunction(p) {
    return fs.lstatSync(p).isSymbolicLink();
}

test('una instancia nueva enlaza assets/libraries contra el almacén compartido', () => {
    const instanceRoot = path.join(INSTANCES_DIR, 'pack-a');
    ensureSharedGameFilesLinked(instanceRoot);

    assert.ok(isJunction(path.join(instanceRoot, 'assets')), 'assets debería ser una junction');
    assert.ok(isJunction(path.join(instanceRoot, 'libraries')), 'libraries debería ser una junction');

    // Un archivo "descargado" para este modpack aparece en el almacén
    // compartido de verdad.
    fs.writeFileSync(path.join(instanceRoot, 'assets', 'sonido.ogg'), 'contenido-sonido');
    assert.ok(fs.existsSync(path.join(VANILLA_ROOT, 'assets', 'sonido.ogg')));
});

test('una segunda instancia ve los archivos ya descargados por la primera, sin volver a descargarlos', () => {
    const instanceB = path.join(INSTANCES_DIR, 'pack-b');
    ensureSharedGameFilesLinked(instanceB);

    // El archivo lo "descargó" pack-a en el test anterior; pack-b debería
    // verlo sin que nadie lo haya vuelto a escribir.
    assert.ok(fs.existsSync(path.join(instanceB, 'assets', 'sonido.ogg')));
    assert.equal(
        fs.readFileSync(path.join(instanceB, 'assets', 'sonido.ogg'), 'utf-8'),
        'contenido-sonido'
    );
});

test('el contenido ya descargado antes de este cambio se migra al almacén compartido sin perderse ni duplicarse', () => {
    const instanceC = path.join(INSTANCES_DIR, 'pack-c');
    // Simula una instancia de antes de este cambio: assets/libraries como
    // carpetas reales con contenido, no junctions.
    fs.mkdirSync(path.join(instanceC, 'assets', 'objects'), { recursive: true });
    fs.writeFileSync(path.join(instanceC, 'assets', 'objects', 'textura.png'), 'ya-tenia-esto');
    // Un archivo que YA existía también en el almacén compartido (mismo
    // nombre): no debe sobreescribirse ni duplicarse, debe conservarse el
    // que ya había en el almacén.
    fs.mkdirSync(path.join(VANILLA_ROOT, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(VANILLA_ROOT, 'assets', 'sonido.ogg'), 'version-compartida-correcta');

    ensureSharedGameFilesLinked(instanceC);

    assert.ok(isJunction(path.join(instanceC, 'assets')));
    // El archivo nuevo se migró de verdad al almacén compartido...
    assert.equal(
        fs.readFileSync(path.join(VANILLA_ROOT, 'assets', 'objects', 'textura.png'), 'utf-8'),
        'ya-tenia-esto'
    );
    // ...y sigue siendo visible a través de la instancia migrada.
    assert.equal(
        fs.readFileSync(path.join(instanceC, 'assets', 'objects', 'textura.png'), 'utf-8'),
        'ya-tenia-esto'
    );
    // El archivo que coincidía por nombre con el almacén compartido no se
    // sobreescribió con una copia distinta.
    assert.equal(
        fs.readFileSync(path.join(VANILLA_ROOT, 'assets', 'sonido.ogg'), 'utf-8'),
        'version-compartida-correcta'
    );
});

test('borrar libraries/ de una instancia (como "Reparar instalación") no borra el contenido compartido', () => {
    const instanceD = path.join(INSTANCES_DIR, 'pack-d');
    ensureSharedGameFilesLinked(instanceD);
    fs.writeFileSync(path.join(instanceD, 'libraries', 'una-libreria.jar'), 'jar-compartido');

    // Mismo borrado recursivo que usa wipeRepairableInstanceData en main.js.
    fs.rmSync(path.join(instanceD, 'libraries'), { recursive: true, force: true });

    assert.ok(
        fs.existsSync(path.join(VANILLA_ROOT, 'libraries', 'una-libreria.jar')),
        'el archivo real en el almacén compartido debe seguir existiendo tras borrar la junction'
    );
    assert.ok(!fs.existsSync(path.join(instanceD, 'libraries')), 'la junction en sí debe haber desaparecido');

    // Y volver a enlazar (lo que hace syncModpackImpl en cada sync) lo deja
    // todo disponible de nuevo sin volver a descargar nada.
    ensureSharedGameFilesLinked(instanceD);
    assert.ok(isJunction(path.join(instanceD, 'libraries')));
    assert.equal(
        fs.readFileSync(path.join(instanceD, 'libraries', 'una-libreria.jar'), 'utf-8'),
        'jar-compartido'
    );
});

test.after(() => {
    fs.rmSync(appDataDir, { recursive: true, force: true });
});
