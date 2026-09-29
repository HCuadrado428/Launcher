const { parseVersionFromDirName, compareVersionArrays } = require('./utils');

// ============================================================================
// OPCIONES DE LANZAMIENTO (lógica pura, probada en test/)
// ============================================================================

// "4G", "2048M"... Lo que no tenga esa forma se ignora y se usa el valor
// por defecto, en vez de pasarlo tal cual a la línea de comandos de Java.
const MEMORY_VALUE_RE = /^\d{1,6}[MG]$/;

function sanitizeMemory(memory) {
    const max = memory && MEMORY_VALUE_RE.test(memory.max) ? memory.max : '4G';
    const min = memory && MEMORY_VALUE_RE.test(memory.min) ? memory.min : '2G';
    return { max, min };
}

// Dirección de servidor de Minecraft: host (nombre o IPv4) y puerto
// opcional. Es lo que acaba como argumento del juego, así que no se acepta
// nada más (espacios, guiones al principio que parecerían otra opción...).
const SERVER_ADDRESS_RE = /^([A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)(?::(\d{1,5}))?$/;

function normalizeServerAddress(address) {
    const match = SERVER_ADDRESS_RE.exec(typeof address === 'string' ? address.trim() : '');
    if (!match) return null;
    const port = match[2] ? Number(match[2]) : null;
    if (port !== null && (port < 1 || port > 65535)) return null;
    return port ? `${match[1]}:${port}` : match[1];
}

// Entrar directamente a un servidor al abrir el juego. Desde 1.20 Minecraft
// usa --quickPlayMultiplayer; antes, los viejos --server/--port ("legacy").
function quickPlayForServer(address, mcVersion) {
    const identifier = normalizeServerAddress(address);
    if (!identifier) return null;
    const supportsQuickPlay = compareVersionArrays(parseVersionFromDirName(mcVersion), [1, 20]) >= 0;
    return { type: supportsQuickPlay ? 'multiplayer' : 'legacy', identifier };
}

module.exports = { sanitizeMemory, normalizeServerAddress, quickPlayForServer };
