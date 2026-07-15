const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { runWithConcurrencyLimit, sha1File } = require('./utils');
const { MODRINTH_USER_AGENT } = require('./modrinth');

// ============================================================================
// DETECCIÓN E IMPORTACIÓN DE MODPACKS INSTALADOS LOCALMENTE
// (CurseForge App / Modrinth App)
// ============================================================================

function mostCommon(arr) {
    if (!arr || arr.length === 0) return null;
    const counts = new Map();
    for (const item of arr) counts.set(item, (counts.get(item) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// Solo detecta las instancias de CurseForge (para avisar de que existen);
// importarlas de verdad requiere una API key de CurseForge que todavía no
// está activada (ver sección de CurseForge más abajo).
function findCurseForgeInstances() {
    const baseDir = path.join(app.getPath('home'), 'curseforge', 'minecraft', 'Instances');
    if (!fs.existsSync(baseDir)) return [];

    const instances = [];
    let entries;
    try {
        entries = fs.readdirSync(baseDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    } catch (err) {
        return [];
    }

    for (const entry of entries) {
        const jsonPath = path.join(baseDir, entry.name, 'minecraftinstance.json');
        if (!fs.existsSync(jsonPath)) continue;
        try {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            instances.push({
                source: 'curseforge',
                name: data.name || entry.name,
                mcVersion: data.gameVersion || '',
                loader: (data.baseModLoader && data.baseModLoader.name) || '',
                modCount: (data.installedAddons || []).length,
                importable: false,
                path: path.join(baseDir, entry.name)
            });
        } catch (err) {
            console.warn(`[WARN] No se pudo leer minecraftinstance.json en ${entry.name}:`, err.message);
        }
    }
    return instances;
}

// Identifica los mods de cada perfil de Modrinth App por el sha1 de sus
// .jar (la app ya no guarda metadatos legibles por perfil, todo vive en un
// app.db sqlite sin esquema documentado).
async function findModrinthInstances() {
    const baseDir = path.join(app.getPath('appData'), 'ModrinthApp', 'profiles');
    if (!fs.existsSync(baseDir)) return [];

    let entries;
    try {
        entries = fs.readdirSync(baseDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    } catch (err) {
        return [];
    }

    const instances = [];
    for (const entry of entries) {
        const modsDir = path.join(baseDir, entry.name, 'mods');
        if (!fs.existsSync(modsDir)) continue;

        const jarFiles = fs.readdirSync(modsDir).filter((f) => f.toLowerCase().endsWith('.jar'));
        if (jarFiles.length === 0) continue;

        const hashes = [];
        await runWithConcurrencyLimit(jarFiles, 8, async (file) => {
            try {
                hashes.push(await sha1File(path.join(modsDir, file)));
            } catch (err) { /* archivo ilegible, se ignora */ }
        });

        let resolvedMods = [];
        if (hashes.length > 0) {
            try {
                const res = await fetch('https://api.modrinth.com/v2/version_files', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'User-Agent': MODRINTH_USER_AGENT },
                    body: JSON.stringify({ hashes, algorithm: 'sha1' })
                });
                if (res.ok) {
                    const map = await res.json();
                    resolvedMods = Object.values(map).map((version) => ({
                        projectId: version.project_id,
                        versionId: version.id,
                        loaders: version.loaders,
                        gameVersions: version.game_versions
                    }));
                }
            } catch (err) {
                console.warn(`[WARN] No se pudieron resolver hashes de Modrinth para ${entry.name}:`, err.message);
            }
        }

        const mcVersion = mostCommon(resolvedMods.flatMap((m) => m.gameVersions || []));
        const loader = mostCommon(resolvedMods.flatMap((m) => m.loaders || []));

        instances.push({
            source: 'modrinth',
            name: entry.name,
            mcVersion: mcVersion || '',
            loader: loader || '',
            modCount: jarFiles.length,
            resolvedCount: resolvedMods.length,
            importable: Boolean(mcVersion && resolvedMods.length > 0),
            path: path.join(baseDir, entry.name),
            resolvedMods
        });
    }
    return instances;
}

module.exports = {
    findCurseForgeInstances,
    findModrinthInstances
};
