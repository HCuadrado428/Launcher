// ============================================================================
// MODRINTH (búsqueda y resolución de mods/resource packs)
// ============================================================================

const { version: APP_VERSION } = require('../package.json');
const { fetchWithTimeout } = require('./httpUtils');
const { tm } = require('./i18nMain');

const MODRINTH_TIMEOUT_MS = 20000;

// Modrinth pide un User-Agent que identifique la app y su versión. Se saca de
// package.json (antes estaba fijo a mano y se quedaba desactualizado).
const MODRINTH_USER_AGENT = `EmberLauncher/${APP_VERSION} (github.com/HCuadrado428/Launcher)`;

// projectType: 'mod' | 'resourcepack' (coincide con el project_type de Modrinth).
async function searchModrinth(query, mcVersion, loader, projectType) {
    const facets = [[`project_type:${projectType}`]];
    if (mcVersion) facets.push([`versions:${mcVersion}`]);
    if (projectType === 'mod' && loader && loader !== 'vanilla') facets.push([`categories:${loader}`]);

    const params = new URLSearchParams({
        query: query || '',
        facets: JSON.stringify(facets),
        limit: '20'
    });

    const res = await fetchWithTimeout(`https://api.modrinth.com/v2/search?${params.toString()}`, {
        headers: { 'User-Agent': MODRINTH_USER_AGENT }
    }, MODRINTH_TIMEOUT_MS);
    if (!res.ok) throw new Error(tm('sys.modrinthSearchFailed', { status: res.status }));
    const data = await res.json();
    return data.hits;
}

// Devuelve la versión más reciente compatible con la versión de Minecraft y
// el loader del modpack, o null si no hay ninguna.
async function resolveBestModrinthVersion(projectId, mcVersion, loader, projectType) {
    const params = new URLSearchParams();
    if (mcVersion) params.set('game_versions', JSON.stringify([mcVersion]));
    if (projectType === 'mod' && loader && loader !== 'vanilla') params.set('loaders', JSON.stringify([loader]));

    const res = await fetchWithTimeout(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version?${params.toString()}`, {
        headers: { 'User-Agent': MODRINTH_USER_AGENT }
    }, MODRINTH_TIMEOUT_MS);
    if (!res.ok) throw new Error(tm('sys.modrinthVersionsFailed', { status: res.status }));
    const versions = await res.json();
    return versions[0] || null;
}

module.exports = {
    MODRINTH_USER_AGENT,
    searchModrinth,
    resolveBestModrinthVersion
};
