// ============================================================================
// QUÉ HA CAMBIADO EN UNA SINCRONIZACIÓN (lógica pura, probada en test/)
// ============================================================================

// Resumen para enseñar al jugador tras sincronizar ("novedades del
// modpack"): mods añadidos, quitados y actualizados, y si cambió la versión
// de Minecraft o el loader. En la primera sincronización no hay nada con qué
// comparar y devuelve null.
function summarizeSyncChanges(plan, localMeta, manifest) {
    if (!localMeta || !Array.isArray(localMeta.mods) || !localMeta.mc_version) return null;
    const localIds = new Set(localMeta.mods.map((m) => m.id));
    const added = plan.toDownload.filter((m) => !localIds.has(m.id)).map((m) => m.filename);
    const updated = plan.toDownload.filter((m) => localIds.has(m.id)).map((m) => m.filename);
    const removed = plan.toDelete.map((m) => m.filename);
    const versionChanged = localMeta.mc_version !== manifest.mc_version || (localMeta.loader || 'vanilla') !== plan.loader;
    if (!added.length && !updated.length && !removed.length && !versionChanged) return null;
    return {
        added,
        updated,
        removed,
        versionChanged,
        mcVersion: manifest.mc_version,
        loader: plan.loader
    };
}

// Antes de aplicar cambios que pueden estropear los mundos al abrirlos
// (quitar mods: sus bloques e ítems desaparecen; cambiar de versión o de
// loader), se hace una copia de saves/.
function changesRiskWorlds(plan, localMeta, manifest) {
    const summary = summarizeSyncChanges(plan, localMeta, manifest);
    if (!summary) return false;
    return summary.versionChanged || plan.toDelete.some((m) => (m.type || 'mod') === 'mod');
}

// RAM recomendada según los mods del modpack, sin pasar de lo que el
// sistema puede dar dejando ~2 GB libres para el propio sistema.
function recommendedMemoryGb(modCount, systemRamGb) {
    let gb = 2;
    if (modCount > 0) gb = 4;
    if (modCount > 60) gb = 6;
    if (modCount > 150) gb = 8;
    if (modCount > 300) gb = 10;
    if (systemRamGb) gb = Math.max(2, Math.min(gb, systemRamGb - 2));
    return gb;
}

module.exports = { summarizeSyncChanges, changesRiskWorlds, recommendedMemoryGb };
