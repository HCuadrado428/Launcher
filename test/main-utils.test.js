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
    sortVersionIdsNewestFirst,
    isSafePathSegment,
    assertSafePathSegment,
    redactSecrets,
    parseMclcLaunchFailure,
    writeFileAtomicSync,
    formatBytesMain,
    getFreeDiskSpaceBytes
} = require('../main/utils');

const { requiredJavaMajorFor, isPlausibleJavaPath } = require('../main/java');

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

test('findNewestJava cachea el resultado (no vuelve a escanear el disco en llamadas posteriores)', () => {
    delete require.cache[require.resolve('../main/java')];
    const { findNewestJava } = require('../main/java');

    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-fake-java-'));
    // parseVersionFromDirName lee este nombre de carpeta para decidir si es
    // "la más nueva"; un número altísimo garantiza que gane la comparación
    // pase lo que pase haya instalado de verdad en la máquina donde corra
    // el test (aquí hay, por ejemplo, un jdk-26.x real).
    const fakeJavaHome = path.join(tmpBase, 'jdk-999.0.1');
    const javaExePath = path.join(fakeJavaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    fs.mkdirSync(path.dirname(javaExePath), { recursive: true });
    fs.writeFileSync(javaExePath, '');

    const originalJavaHome = process.env.JAVA_HOME;
    process.env.JAVA_HOME = fakeJavaHome;
    try {
        const first = findNewestJava();
        assert.equal(first, javaExePath, 'la primera llamada debería encontrar el Java falso (versión más alta) vía JAVA_HOME');

        // Se borra el JDK falso: si findNewestJava no estuviera cacheado, la
        // siguiente llamada ya no lo encontraría (o encontraría otra cosa).
        fs.rmSync(tmpBase, { recursive: true, force: true });
        const second = findNewestJava();
        assert.equal(second, first, 'la segunda llamada debe devolver el resultado cacheado, sin volver a escanear el disco');
    } finally {
        if (originalJavaHome === undefined) delete process.env.JAVA_HOME;
        else process.env.JAVA_HOME = originalJavaHome;
        fs.rmSync(tmpBase, { recursive: true, force: true });
    }
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

test('sortVersionIdsNewestFirst pone primero la release más nueva, no el orden de readdir', () => {
    assert.deepEqual(
        sortVersionIdsNewestFirst(['1.20.1', '1.21.1', '1.9', '24w14a', '1.21']),
        ['1.21.1', '1.21', '1.20.1', '1.9', '24w14a']
    );
    assert.deepEqual(sortVersionIdsNewestFirst([]), []);
});

test('isSafePathSegment solo acepta un nombre simple dentro de la carpeta', () => {
    for (const ok of ['sodium-0.5.jar', 'Mi Pack (1).zip', '42', 42, 'a.b.c']) {
        assert.ok(isSafePathSegment(ok), `debería aceptar ${JSON.stringify(ok)}`);
    }
    for (const bad of ['', '.', '..', '.. ', 'mod.jar.', 'mod.jar ', '../x.jar', 'a/b.jar', 'a\\b.jar',
        'C:evil.jar', 'mod.jar:stream', 'nul\u0000.jar', 'x\n.jar', 'a'.repeat(256), null, undefined, {}, NaN]) {
        assert.ok(!isSafePathSegment(bad), `debería rechazar ${JSON.stringify(bad)}`);
    }
});

test('assertSafePathSegment devuelve el valor como texto o lanza con un mensaje claro', () => {
    assert.equal(assertSafePathSegment(7, 'Id'), '7');
    assert.throws(() => assertSafePathSegment('..', 'Id de modpack'), /Id de modpack no válido/);
});

test('redactSecrets tapa el access token de la línea de comandos de Minecraft', () => {
    const line = '[MCLC]: Launching with arguments -Xmx4G --username Steve --accessToken eyJabc.def-123 --userType msa';
    const redacted = redactSecrets(line);
    assert.ok(!redacted.includes('eyJabc.def-123'));
    assert.ok(redacted.includes('--accessToken ***'));
    assert.ok(redacted.includes('--username Steve'));
    assert.equal(redactSecrets('[--accessToken, abc123, --version]'), '[--accessToken, ***, --version]');
    assert.equal(redactSecrets('línea normal'), 'línea normal');
});

test('parseMclcLaunchFailure extrae el motivo de los fallos de launch()', () => {
    assert.equal(
        parseMclcLaunchFailure("[MCLC]: Couldn't start Minecraft due to: Error: spawn java ENOENT"),
        'Error: spawn java ENOENT'
    );
    assert.equal(
        parseMclcLaunchFailure('[MCLC]: Failed to start due to Error: ENOENT: no such file, closing...'),
        'Error: ENOENT: no such file'
    );
    assert.equal(parseMclcLaunchFailure('[MCLC]: Launching with arguments -Xmx4G'), null);
});

test('writeFileAtomicSync escribe y sobreescribe sin dejar temporales', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-atomic-'));
    try {
        const target = path.join(dir, 'config.json');
        writeFileAtomicSync(target, '{"a":1}');
        writeFileAtomicSync(target, Buffer.from('{"a":2}'));
        assert.equal(fs.readFileSync(target, 'utf-8'), '{"a":2}');
        assert.deepEqual(fs.readdirSync(dir), ['config.json']);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('isPlausibleJavaPath solo acepta ejecutables java/javaw sin caracteres de shell', () => {
    for (const ok of [
        'C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\javaw.exe',
        'C:\\Program Files\\Java\\jre1.8.0_401\\bin\\java.exe',
        '/usr/lib/jvm/java-21/bin/java',
        'java'
    ]) {
        assert.ok(isPlausibleJavaPath(ok), `debería aceptar ${ok}`);
    }
    for (const bad of [
        'C:\\Windows\\System32\\cmd.exe',
        '/bin/sh',
        'C:\\x" & calc & "\\java.exe',
        '/tmp/$(touch pwned)/java',
        '/tmp/`id`/java',
        '',
        '   ',
        null
    ]) {
        assert.ok(!isPlausibleJavaPath(bad), `debería rechazar ${JSON.stringify(bad)}`);
    }
});
