const { isSafePathSegment } = require('./utils');

// ============================================================================
// FORMATO .mrpack DE MODRINTH (lógica pura, probada en test/)
// ============================================================================
// https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack

const DEPENDENCY_KEY_BY_LOADER = {
    forge: 'forge',
    neoforge: 'neoforge',
    fabric: 'fabric-loader',
    quilt: 'quilt-loader'
};

// Loader y versión de un modpack a partir de "dependencies" del índice.
function loaderFromDependencies(dependencies = {}) {
    for (const [loader, key] of Object.entries(DEPENDENCY_KEY_BY_LOADER)) {
        if (dependencies[key]) return { loader, loaderVersion: String(dependencies[key]) };
    }
    return { loader: 'vanilla', loaderVersion: '' };
}

function dependenciesFor(mcVersion, loader, loaderVersion) {
    const dependencies = { minecraft: mcVersion };
    const key = DEPENDENCY_KEY_BY_LOADER[loader];
    if (key && loaderVersion) dependencies[key] = loaderVersion;
    return dependencies;
}

// Versión del loader a partir del id de versión que instaló @xmcl, para
// modpacks antiguos que no guardaron la versión pedida:
// "1.21.1-fabric0.16.5", "1.21.1-quilt0.26.4", "1.20.1-forge-47.2.0",
// "neoforge-21.1.77".
function loaderVersionFromId(loader, versionId) {
    const id = String(versionId || '');
    const patterns = {
        fabric: /-fabric(.+)$/,
        quilt: /-quilt(.+)$/,
        forge: /-forge-?(.+)$/,
        neoforge: /^neoforge-(.+)$/
    };
    const match = patterns[loader] && patterns[loader].exec(id);
    return match ? match[1] : '';
}

// Solo se descargan archivos de los dominios que admite el formato.
const ALLOWED_DOWNLOAD_HOSTS = new Set(['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com']);

function isAllowedMrpackDownload(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname);
    } catch (err) {
        return false;
    }
}

// Qué hacer con un archivo del índice o de overrides/ al importar:
// - { kind: 'mod' | 'resourcepack', fileName }
// - { kind: 'config', relPath } (config/** y options.txt → config compartida)
// - null: se ignora (shaderpacks, scripts, rutas raras...).
function classifyPackPath(relPath) {
    const parts = String(relPath).split('/');
    if (!parts.every(isSafePathSegment)) return null;
    if (parts.length === 2 && parts[0] === 'mods' && parts[1].toLowerCase().endsWith('.jar')) return { kind: 'mod', fileName: parts[1] };
    if (parts.length === 2 && parts[0] === 'resourcepacks' && parts[1].toLowerCase().endsWith('.zip')) return { kind: 'resourcepack', fileName: parts[1] };
    if ((parts[0] === 'config' && parts.length > 1) || (parts.length === 1 && parts[0] === 'options.txt')) return { kind: 'config', relPath: parts.join('/') };
    return null;
}

// Ruta dentro del .mrpack de una entrada de overrides: overrides/ y
// client-overrides/ (este último pisa al primero). Devuelve la ruta relativa
// a la instancia o null si no es un override.
function overrideRelPath(entryName) {
    const match = /^(client-)?overrides\/(.+)$/.exec(entryName);
    return match ? { relPath: match[2], clientOnly: Boolean(match[1]) } : null;
}

function validateIndex(index) {
    if (!index || index.game !== 'minecraft' || index.formatVersion !== 1) {
        throw new Error('invalid');
    }
    if (!index.dependencies || !index.dependencies.minecraft) throw new Error('invalid');
    if (!Array.isArray(index.files)) throw new Error('invalid');
    return index;
}

module.exports = {
    loaderFromDependencies,
    dependenciesFor,
    loaderVersionFromId,
    isAllowedMrpackDownload,
    classifyPackPath,
    overrideRelPath,
    validateIndex
};
