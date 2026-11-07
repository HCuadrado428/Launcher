// ============================================================================
// PLAN DE SINCRONIZACIÓN DE UN MODPACK (lógica pura, sin disco ni red)
// ============================================================================

// Compara el manifiesto del servidor con lo que dice la meta local
// (.launcher-meta.json) y decide qué hay que borrar, qué hay que descargar y
// si hace falta (re)instalar el loader. Está separado del resto de la
// sincronización para poder probarlo sin Electron, red ni disco.
//
// - optionalChoices: elección local del jugador por mod opcional
//   ({ [modId]: false } = excluido; ausencia = incluido).
// - versionJsonExists(loaderVersionId): si el version.json del loader que
//   la meta dice tener instalado sigue en disco.
function computeSyncPlan({ manifest, localMeta, optionalChoices = {}, versionJsonExists = () => true }) {
    // Los mods antiguos sincronizados antes de que existiera "type" no lo
    // tienen guardado en el meta local; se asumen mods normales.
    const remoteMods = (manifest.mods || [])
        .map((m) => ({ type: 'mod', ...m }))
        .filter((m) => !(m.optional && optionalChoices[m.id] === false));
    const localMods = (localMeta.mods || []).map((m) => ({ type: 'mod', ...m }));

    const remoteById = new Map(remoteMods.map((m) => [m.id, m]));
    const localById = new Map(localMods.map((m) => [m.id, m]));

    const toDelete = localMods.filter((m) => !remoteById.has(m.id));
    const toDownload = remoteMods.filter((m) => {
        const local = localById.get(m.id);
        return !local || local.sha1 !== m.sha1;
    });

    const loader = manifest.loader || 'vanilla';
    const requestedLoaderVersion = manifest.loader_version || '';
    const loaderVersionId = localMeta.loader_version_id || null;
    const needsLoaderInstall = loader !== 'vanilla' && (
        localMeta.loader !== loader ||
        localMeta.mc_version !== manifest.mc_version ||
        (localMeta.requested_loader_version || '') !== requestedLoaderVersion ||
        !loaderVersionId ||
        !versionJsonExists(loaderVersionId)
    );

    const totalDownloadBytes = toDownload.reduce((sum, m) => sum + (m.filesize || 0), 0);

    return {
        remoteMods,
        toDelete,
        toDownload,
        loader,
        requestedLoaderVersion,
        loaderVersionId: loader === 'vanilla' ? null : loaderVersionId,
        needsLoaderInstall,
        totalDownloadBytes
    };
}

module.exports = { computeSyncPlan };
