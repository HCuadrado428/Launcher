const { apiPath } = require('./httpUtils');
const { apiRequest } = require('./backend');
const { resolveBestModrinthVersion, getVersionsByHashes, getProjectTitles, missingRequiredDependencies } = require('./modrinth');
const { tm } = require('./i18nMain');

// ============================================================================
// AÑADIR MODS DE MODRINTH CON SUS DEPENDENCIAS, Y ACTUALIZARLOS
// ============================================================================

// Proyectos de Modrinth que ya tiene el modpack. El manifiesto no siempre
// trae project_id (p.ej. mods subidos a mano que también están en Modrinth),
// así que se completan buscando cada archivo por su sha1.
async function installedProjectIds(mods) {
    const ids = new Set(mods.map((m) => m.project_id).filter(Boolean));
    const unknownHashes = mods.filter((m) => !m.project_id && m.sha1).map((m) => m.sha1);
    const byHash = await getVersionsByHashes(unknownHashes);
    for (const version of Object.values(byHash)) ids.add(version.project_id);
    return [...ids];
}

function addVersion(modpackId, projectId, versionId, type) {
    return apiRequest(apiPath`/api/modpacks/${modpackId}/mods/from-modrinth`, {
        method: 'POST',
        body: { project_id: projectId, version_id: versionId, type }
    });
}

// Añade un mod/resource pack de Modrinth y, si es un mod, calcula qué
// dependencias obligatorias le faltan al modpack para ofrecer añadirlas
// con un clic (missingDependencies: [{ projectId, title }]). Si ese cálculo
// falla (sin red...), el mod ya está añadido y simplemente no se ofrece nada.
async function addModFromModrinth({ id, projectId, mcVersion, loader, projectType }) {
    const version = await resolveBestModrinthVersion(projectId, mcVersion, loader, projectType);
    if (!version) throw new Error(tm('sys.noCompatibleModVersion'));
    const result = await addVersion(id, projectId, version.id, projectType);

    let missingDependencies = [];
    if (projectType === 'mod') {
        try {
            const manifest = await apiRequest(apiPath`/api/modpacks/${id}/manifest`);
            const installed = await installedProjectIds(manifest.mods || []);
            const missing = await missingRequiredDependencies(version, [...installed, projectId]);
            const titles = await getProjectTitles(missing);
            missingDependencies = missing.map((pid) => ({ projectId: pid, title: titles[pid] || pid }));
        } catch (err) {
            console.warn('[WARN] No se pudieron calcular las dependencias del mod:', err.message);
        }
    }
    return { ...result, missingDependencies };
}

// Añade varias dependencias (las que ofreció addModFromModrinth). Las que no
// tienen versión compatible o fallan se devuelven en failed.
async function addModrinthDependencies({ id, projectIds, mcVersion, loader }) {
    const titles = await getProjectTitles(projectIds).catch(() => ({}));
    const added = [];
    const failed = [];
    for (const projectId of projectIds) {
        try {
            const version = await resolveBestModrinthVersion(projectId, mcVersion, loader, 'mod');
            if (!version) throw new Error(tm('sys.noCompatibleModVersion'));
            await addVersion(id, projectId, version.id, 'mod');
            added.push(titles[projectId] || projectId);
        } catch (err) {
            failed.push(titles[projectId] || projectId);
        }
    }
    return { added, failed };
}

// Sustituye un mod por la versión más reciente compatible en Modrinth.
// Primero se añade la nueva y luego se quita la vieja; si el backend no
// admite dos versiones del mismo proyecto a la vez, se hace al revés y, si
// la nueva falla, se vuelve a poner la anterior para no dejar el modpack sin
// el mod.
async function updateMod({ id, modId, mcVersion, loader }) {
    const manifest = await apiRequest(apiPath`/api/modpacks/${id}/manifest`);
    const mod = (manifest.mods || []).find((m) => String(m.id) === String(modId));
    if (!mod) throw new Error(tm('sys.modNotFound'));

    const current = mod.sha1 ? (await getVersionsByHashes([mod.sha1]))[mod.sha1] : null;
    const projectId = mod.project_id || (current && current.project_id);
    if (!projectId) throw new Error(tm('sys.modNotOnModrinth'));

    const type = mod.type || 'mod';
    const latest = await resolveBestModrinthVersion(projectId, mcVersion, loader, type);
    if (!latest) throw new Error(tm('sys.noCompatibleModVersion'));
    const latestFiles = latest.files || [];
    if ((current && current.id === latest.id) || latestFiles.some((f) => f.hashes && f.hashes.sha1 === mod.sha1)) {
        return { updated: false };
    }

    const removeOld = () => apiRequest(apiPath`/api/modpacks/${id}/mods/${mod.id}`, { method: 'DELETE' });
    try {
        await addVersion(id, projectId, latest.id, type);
    } catch (err) {
        if (err.status !== 409 && err.status !== 400) throw err;
        await removeOld();
        try {
            await addVersion(id, projectId, latest.id, type);
        } catch (retryErr) {
            if (current) await addVersion(id, projectId, current.id, type).catch(() => {});
            throw retryErr;
        }
        return { updated: true, version: latest.version_number };
    }
    await removeOld();
    return { updated: true, version: latest.version_number };
}

module.exports = { addModFromModrinth, addModrinthDependencies, updateMod, installedProjectIds };
