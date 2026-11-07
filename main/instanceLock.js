// Sincronizar, reparar, verificar y borrar tocan los mismos archivos de una
// instancia. Antes podían ejecutarse a la vez sobre el mismo modpack (p.ej.
// "Seleccionar" y justo después "Iniciar juego", que vuelve a sincronizar),
// pisándose descargas, borrados y el .launcher-meta.json.

// Ejecuta las tareas de una misma clave de una en una, en orden de llegada.
// Claves distintas no se esperan entre sí.
function createKeyedLock() {
    const tails = new Map();
    return function runExclusive(key, task) {
        const previous = tails.get(key) || Promise.resolve();
        const result = previous.then(() => task());
        const tail = result.catch(() => {});
        tails.set(key, tail);
        tail.then(() => {
            if (tails.get(key) === tail) tails.delete(key);
        });
        return result;
    };
}

// Si ya hay una tarea en marcha con la misma clave, devuelve esa misma
// promesa en vez de lanzar otra: pedir dos veces seguidas la sincronización
// de un modpack debe esperar a la que ya está corriendo, no repetirla.
function createSingleFlight() {
    const inFlight = new Map();
    return function join(key, task) {
        if (inFlight.has(key)) return inFlight.get(key);
        const promise = Promise.resolve()
            .then(() => task())
            .finally(() => inFlight.delete(key));
        inFlight.set(key, promise);
        return promise;
    };
}

module.exports = { createKeyedLock, createSingleFlight };
