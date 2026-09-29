// main/instanceLock.js evita que sincronizar/reparar/verificar el mismo
// modpack se ejecuten a la vez, y que dos peticiones de sincronización
// seguidas descarguen todo dos veces.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createKeyedLock, createSingleFlight } = require('../main/instanceLock');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('createKeyedLock ejecuta en serie las tareas de una misma clave', async () => {
    const runExclusive = createKeyedLock();
    const events = [];
    const task = (name) => async () => {
        events.push(`${name}:start`);
        await delay(10);
        events.push(`${name}:end`);
        return name;
    };

    const results = await Promise.all([
        runExclusive('pack-1', task('a')),
        runExclusive('pack-1', task('b'))
    ]);

    assert.deepEqual(results, ['a', 'b']);
    assert.deepEqual(events, ['a:start', 'a:end', 'b:start', 'b:end']);
});

test('createKeyedLock no hace esperar a claves distintas', async () => {
    const runExclusive = createKeyedLock();
    let active = 0;
    let maxActive = 0;
    const task = async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await delay(10);
        active--;
    };
    await Promise.all([runExclusive('pack-1', task), runExclusive('pack-2', task)]);
    assert.equal(maxActive, 2);
});

test('createKeyedLock sigue funcionando después de una tarea que falla', async () => {
    const runExclusive = createKeyedLock();
    await assert.rejects(runExclusive('pack-1', async () => { throw new Error('boom'); }), /boom/);
    assert.equal(await runExclusive('pack-1', async () => 'ok'), 'ok');
});

test('createSingleFlight reutiliza la tarea en marcha y la olvida al terminar', async () => {
    const join = createSingleFlight();
    let runs = 0;
    const task = async () => {
        runs++;
        await delay(10);
        return runs;
    };

    const [first, second] = await Promise.all([join('pack-1', task), join('pack-1', task)]);
    assert.equal(runs, 1, 'dos peticiones seguidas deben compartir una sola ejecución');
    assert.equal(first, 1);
    assert.equal(second, 1);

    assert.equal(await join('pack-1', task), 2, 'terminada la primera, una nueva petición vuelve a ejecutarse');
});

test('createSingleFlight también se libera cuando la tarea falla', async () => {
    const join = createSingleFlight();
    await assert.rejects(join('pack-1', async () => { throw new Error('boom'); }), /boom/);
    assert.equal(await join('pack-1', async () => 'ok'), 'ok');
});
