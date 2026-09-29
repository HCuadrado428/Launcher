const { parseVersionFromDirName, compareVersionArrays } = require('./utils');

// ============================================================================
// VERSIONES DE NEOFORGE Y QUILT (lógica pura, probada en test/)
// ============================================================================

const LOADERS = ['vanilla', 'forge', 'neoforge', 'fabric', 'quilt'];

function isSupportedLoader(loader) {
    return LOADERS.includes(loader);
}

// Prefijo de las versiones de NeoForge para una versión de Minecraft:
// 1.20.2 → "20.2.", 1.21 → "21.0.", 1.21.1 → "21.1.". Con la numeración
// por años de Minecraft (26.1, 26.1.1...) NeoForge usa la misma versión de
// Minecraft como prefijo: 26.1 → "26.1.0.", 26.1.1 → "26.1.1.".
// NeoForge para 1.20.1 es un artefacto distinto (net.neoforged:forge) y no
// está soportado: devuelve null.
function neoForgePrefixFor(mcVersion) {
    const parts = String(mcVersion).split('.');
    if (parts[0] === '1') {
        const minor = Number(parts[1]);
        if (!(minor > 20 || (minor === 20 && Number(parts[2] || 0) >= 2))) return null;
        return `${parts[1]}.${parts[2] || 0}.`;
    }
    return parts.length === 2 ? `${mcVersion}.0.` : `${mcVersion}.`;
}

const newestFirst = (a, b) => compareVersionArrays(parseVersionFromDirName(b), parseVersionFromDirName(a));
const isUnstable = (v) => /beta|alpha|rc|pre/i.test(v);

// De la lista completa de maven-metadata.xml de NeoForge, las que valen para
// esa versión de Minecraft, de más nueva a más antigua; se recomienda la
// estable más reciente (o la más reciente si todas son beta).
function neoForgeVersionsForMc(allVersions, mcVersion) {
    const prefix = neoForgePrefixFor(mcVersion);
    if (!prefix) return [];
    const matching = [...new Set(allVersions.filter((v) => v.startsWith(prefix)))].sort(newestFirst);
    const recommended = matching.find((v) => !isUnstable(v)) || matching[0];
    return matching.map((version) => ({ version, recommended: version === recommended, stable: !isUnstable(version) }));
}

// Versiones de Quilt Loader (respuesta de meta.quiltmc.org, más nuevas
// primero): se recomienda la estable más reciente.
function quiltVersionsFromMeta(artifacts) {
    const versions = [...new Set((artifacts || []).map((a) => a.loader && a.loader.version).filter(Boolean))];
    const recommended = versions.find((v) => !isUnstable(v)) || versions[0];
    return versions.map((version) => ({ version, recommended: version === recommended, stable: !isUnstable(version) }));
}

// Loaders de Modrinth con los que es compatible un modpack: Quilt carga
// también mods de Fabric.
function modrinthLoadersFor(loader) {
    if (loader === 'quilt') return ['quilt', 'fabric'];
    return loader && loader !== 'vanilla' ? [loader] : [];
}

module.exports = { LOADERS, isSupportedLoader, neoForgePrefixFor, neoForgeVersionsForMc, quiltVersionsFromMeta, modrinthLoadersFor };
