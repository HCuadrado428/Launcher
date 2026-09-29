const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { runWithConcurrencyLimit, sha1File } = require('./utils');
const { getVersionsByHashes } = require('./modrinth');
const { parseCurseForgeLoader } = require('./curseforge');
const { isSupportedLoader } = require('./loaderVersions');

// ============================================================================
// DETECCIÓN DE MODPACKS INSTALADOS LOCALMENTE (CurseForge App / Modrinth App)
// ============================================================================

function mostCommon(arr) {
    if (!arr || arr.length === 0) return null;
    const counts = new Map();
    for (const item of arr) counts.set(item, (counts.get(item) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function listSubdirectories(baseDir) {
    try {
        return fs.readdirSync(baseDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch (err) {
        return [];
    }
}

// Identifica los .jar de la carpeta mods/ de una instancia en Modrinth por
// su sha1 (tanto Modrinth App como la app de CurseForge suelen tener
// exactamente el mismo archivo que Modrinth publica). Devuelve los mods
// resueltos (para añadirlos desde Modrinth) y la lista de archivos que no
// se reconocieron.
async function scanModsFolder(modsDir) {
    let jarFiles;
    try {
        jarFiles = fs.readdirSync(modsDir).filter((f) => f.toLowerCase().endsWith('.jar'));
    } catch (err) {
        return { jarFiles: [], resolvedMods: [], unresolvedFiles: [] };
    }

    const hashed = [];
    await runWithConcurrencyLimit(jarFiles, 8, async (fileName) => {
        try {
            hashed.push({ fileName, sha1: await sha1File(path.join(modsDir, fileName)) });
        } catch (err) { /* archivo ilegible, se ignora */ }
    });

    let byHash = {};
    try {
        byHash = await getVersionsByHashes(hashed.map((h) => h.sha1));
    } catch (err) {
        console.warn(`[WARN] No se pudieron resolver los mods de ${modsDir} en Modrinth:`, err.message);
    }

    const resolvedMods = [];
    const unresolvedFiles = [];
    for (const { fileName, sha1 } of hashed) {
        const version = byHash[sha1];
        if (version) {
            resolvedMods.push({ projectId: version.project_id, versionId: version.id, loaders: version.loaders, gameVersions: version.game_versions });
        } else {
            unresolvedFiles.push(fileName);
        }
    }
    return { jarFiles, resolvedMods, unresolvedFiles };
}

function instanceSummary({ source, name, instancePath, mcVersion, loader, loaderVersion, scan }) {
    return {
        source,
        name,
        mcVersion: mcVersion || '',
        loader: isSupportedLoader(loader) ? loader : 'vanilla',
        loaderVersion: loaderVersion || '',
        modCount: scan.jarFiles.length,
        resolvedCount: scan.resolvedMods.length,
        importable: Boolean(mcVersion && scan.resolvedMods.length > 0),
        path: instancePath,
        resolvedMods: scan.resolvedMods,
        unresolvedFiles: scan.unresolvedFiles
    };
}

// Instancias de la app de CurseForge: versión y loader salen de su
// minecraftinstance.json; los mods, de su carpeta mods/.
async function findCurseForgeInstances() {
    const baseDir = path.join(app.getPath('home'), 'curseforge', 'minecraft', 'Instances');
    const instances = [];
    for (const dirName of listSubdirectories(baseDir)) {
        const instancePath = path.join(baseDir, dirName);
        let data;
        try {
            data = JSON.parse(fs.readFileSync(path.join(instancePath, 'minecraftinstance.json'), 'utf-8'));
        } catch (err) {
            continue;
        }
        const { loader, loaderVersion } = parseCurseForgeLoader(data.baseModLoader && data.baseModLoader.name);
        const scan = await scanModsFolder(path.join(instancePath, 'mods'));
        if (scan.jarFiles.length === 0) continue;
        instances.push(instanceSummary({
            source: 'curseforge',
            name: data.name || dirName,
            instancePath,
            mcVersion: data.gameVersion,
            loader,
            loaderVersion,
            scan
        }));
    }
    return instances;
}

// Perfiles de Modrinth App: la app ya no guarda metadatos legibles por
// perfil (todo vive en un app.db sqlite sin esquema documentado), así que
// versión y loader se deducen de los propios mods.
async function findModrinthInstances() {
    const baseDir = path.join(app.getPath('appData'), 'ModrinthApp', 'profiles');
    const instances = [];
    for (const dirName of listSubdirectories(baseDir)) {
        const instancePath = path.join(baseDir, dirName);
        const scan = await scanModsFolder(path.join(instancePath, 'mods'));
        if (scan.jarFiles.length === 0) continue;
        instances.push(instanceSummary({
            source: 'modrinth',
            name: dirName,
            instancePath,
            mcVersion: mostCommon(scan.resolvedMods.flatMap((m) => m.gameVersions || [])),
            loader: mostCommon(scan.resolvedMods.flatMap((m) => m.loaders || [])),
            scan
        }));
    }
    return instances;
}

module.exports = {
    findCurseForgeInstances,
    findModrinthInstances
};
