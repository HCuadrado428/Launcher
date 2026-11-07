// ============================================================================
// MODRINTH (búsqueda y resolución de mods/resource packs)
// ============================================================================

const { version: APP_VERSION } = require('../package.json');
const { fetchWithTimeout } = require('./httpUtils');
const { tm } = require('./i18nMain');
const { modrinthLoadersFor } = require('./loaderVersions');

const MODRINTH_TIMEOUT_MS = 20000;

// Modrinth pide un User-Agent que identifique la app y su versión. Se saca de
// package.json (antes estaba fijo a mano y se quedaba desactualizado).
const MODRINTH_USER_AGENT = `EmberLauncher/${APP_VERSION} (github.com/HCuadrado428/Launcher)`;

// projectType: 'mod' | 'resourcepack' (coincide con el project_type de Modrinth).
async function searchModrinth(query, mcVersion, loader, projectType) {
    const facets = [[`project_type:${projectType}`]];
    if (mcVersion) facets.push([`versions:${mcVersion}`]);
    // Un grupo de facets es un OR: un modpack de Quilt acepta mods de Quilt y de Fabric.
    const loaders = modrinthLoadersFor(loader);
    if (projectType === 'mod' && loaders.length) facets.push(loaders.map((l) => `categories:${l}`));

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
    const loaders = modrinthLoadersFor(loader);
    if (projectType === 'mod' && loaders.length) params.set('loaders', JSON.stringify(loaders));

    const res = await fetchWithTimeout(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version?${params.toString()}`, {
        headers: { 'User-Agent': MODRINTH_USER_AGENT }
    }, MODRINTH_TIMEOUT_MS);
    if (!res.ok) throw new Error(tm('sys.modrinthVersionsFailed', { status: res.status }));
    const versions = await res.json();
    return versions[0] || null;
}

async function modrinthGetJson(url, init = {}) {
    const res = await fetchWithTimeout(url, {
        ...init,
        headers: { 'User-Agent': MODRINTH_USER_AGENT, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) }
    }, MODRINTH_TIMEOUT_MS);
    if (!res.ok) throw new Error(tm('sys.modrinthVersionsFailed', { status: res.status }));
    return res.json();
}

// Versiones de Modrinth que corresponden a unos archivos, por su sha1
// ({ [sha1]: version }). Los que no están en Modrinth no aparecen.
async function getVersionsByHashes(hashes) {
    if (!hashes.length) return {};
    return modrinthGetJson('https://api.modrinth.com/v2/version_files', {
        method: 'POST',
        body: JSON.stringify({ hashes, algorithm: 'sha1' })
    });
}

async function getProjectTitles(projectIds) {
    if (!projectIds.length) return {};
    const projects = await modrinthGetJson(`https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(projectIds))}`);
    return Object.fromEntries(projects.map((p) => [p.id, p.title]));
}

async function getVersion(versionId) {
    return modrinthGetJson(`https://api.modrinth.com/v2/version/${encodeURIComponent(versionId)}`);
}

// Dependencias obligatorias de una versión que no están ya en el modpack.
// Algunas dependencias solo traen version_id (sin project_id): esas se
// resuelven con una consulta aparte.
async function missingRequiredDependencies(version, installedProjectIds) {
    const installed = new Set(installedProjectIds);
    const projectIds = [];
    for (const dep of (version && version.dependencies) || []) {
        if (dep.dependency_type !== 'required') continue;
        let projectId = dep.project_id;
        if (!projectId && dep.version_id) {
            try { projectId = (await getVersion(dep.version_id)).project_id; } catch (err) { projectId = null; }
        }
        if (projectId && !installed.has(projectId) && !projectIds.includes(projectId)) projectIds.push(projectId);
    }
    return projectIds;
}

module.exports = {
    getVersionsByHashes,
    getProjectTitles,
    missingRequiredDependencies,
    MODRINTH_USER_AGENT,
    searchModrinth,
    resolveBestModrinthVersion
};
