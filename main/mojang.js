const fs = require('fs');
const path = require('path');
const { fetchWithTimeout } = require('./httpUtils');
const { VANILLA_ROOT } = require('./paths');

// ============================================================================
// ÚLTIMA VERSIÓN DE MINECRAFT (igual que antes, para el modo "sin modpack")
// ============================================================================

// El manifiesto de versiones de Mojang pesa varios MB y se usaba para dos
// cosas que se piden por separado (última versión al lanzar, lista de
// releases al crear un modpack), cada una descargando y parseando su propia
// copia. La "última versión" casi nunca cambia de un lanzamiento a otro, así
// que ahora se comparte una sola copia en memoria con un tiempo de validez:
// dentro de esa ventana no se vuelve a pedir ni a parsear nada.
const MOJANG_MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
const MOJANG_MANIFEST_TTL_MS = 30 * 60 * 1000;

let mojangManifestCache = null;
let mojangManifestFetchedAt = 0;

async function getMojangManifest() {
    const isFresh = mojangManifestCache && (Date.now() - mojangManifestFetchedAt) < MOJANG_MANIFEST_TTL_MS;
    if (isFresh) return mojangManifestCache;

    try {
        const response = await fetchWithTimeout(MOJANG_MANIFEST_URL, {}, 15000);
        if (!response.ok) throw new Error(`Mojang respondió con estado ${response.status}`);
        const data = await response.json();
        mojangManifestCache = data;
        mojangManifestFetchedAt = Date.now();
        return data;
    } catch (err) {
        // Mejor una copia caducada que nada: seguimos pudiendo jugar aunque
        // Mojang esté caído o no haya conexión en este momento.
        if (mojangManifestCache) return mojangManifestCache;
        throw err;
    }
}

// Versiones vanilla que ya están instaladas localmente (carpetas dentro de
// VANILLA_ROOT/versions). Se usa como mejor alternativa a un número de
// versión fijo cuando no hay forma de preguntarle a Mojang cuál es la
// última.
function getInstalledVanillaVersions() {
    try {
        return fs.readdirSync(path.join(VANILLA_ROOT, 'versions'), { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
    } catch (err) {
        return [];
    }
}

// Devuelve { version, fallback }: fallback=true significa que no se pudo
// consultar a Mojang (sin red, o el propio Mojang caído) y no había ninguna
// copia en caché en memoria de esta sesión. Antes en ese caso se devolvía
// silenciosamente "1.20.1" a ciegas, sin avisar a nadie ni comprobar si ya
// había una versión vanilla instalada localmente que tuviera más sentido
// reutilizar (evita, p.ej., que el launcher intente lanzar 1.20.1 cuando en
// realidad el jugador ya tiene la 1.21.1 descargada de la sesión anterior).
async function getMinecraftVersionToLaunch() {
    try {
        const data = await getMojangManifest();
        if (!data || !data.latest || !data.latest.release) {
            throw new Error('La respuesta de Mojang no tiene el formato esperado.');
        }
        return { version: data.latest.release, fallback: false };
    } catch (err) {
        console.warn('[WARN] No se pudo consultar la última versión de Minecraft:', err.message);
        const installed = getInstalledVanillaVersions();
        return { version: installed[0] || '1.20.1', fallback: true };
    }
}

// Todas las versiones "release" de Minecraft, de más reciente a más antigua,
// sin snapshots ni versiones beta/alpha. Se usa para poblar el <select> de
// versión al crear un modpack.
async function getReleaseVersionsToShow() {
    try {
        const data = await getMojangManifest();
        return (data.versions || [])
            .filter((v) => v.type === 'release')
            .map((v) => v.id);
    } catch (err) {
        console.warn('[WARN] No se pudo consultar la lista de versiones de Minecraft:', err.message);
        return [];
    }
}

module.exports = {
    getMojangManifest,
    getInstalledVanillaVersions,
    getMinecraftVersionToLaunch,
    getReleaseVersionsToShow
};
