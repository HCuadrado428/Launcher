// ============================================================================
// MODRINTH (búsqueda y resolución de mods/resource packs)
// ============================================================================

const MODRINTH_USER_AGENT = 'EmberLauncher/1.0 (github.com/HCuadrado428/Launcher)';

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

    const res = await fetch(`https://api.modrinth.com/v2/search?${params.toString()}`, {
        headers: { 'User-Agent': MODRINTH_USER_AGENT }
    });
    if (!res.ok) throw new Error(`Modrinth respondió con estado ${res.status} al buscar.`);
    const data = await res.json();
    return data.hits;
}

// Devuelve la versión más reciente compatible con la versión de Minecraft y
// el loader del modpack, o null si no hay ninguna.
async function resolveBestModrinthVersion(projectId, mcVersion, loader, projectType) {
    const params = new URLSearchParams();
    if (mcVersion) params.set('game_versions', JSON.stringify([mcVersion]));
    if (projectType === 'mod' && loader && loader !== 'vanilla') params.set('loaders', JSON.stringify([loader]));

    const res = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version?${params.toString()}`, {
        headers: { 'User-Agent': MODRINTH_USER_AGENT }
    });
    if (!res.ok) throw new Error(`Modrinth respondió con estado ${res.status} al consultar versiones.`);
    const versions = await res.json();
    return versions[0] || null;
}

module.exports = {
    MODRINTH_USER_AGENT,
    searchModrinth,
    resolveBestModrinthVersion
};
