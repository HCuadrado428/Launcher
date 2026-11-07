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

// Parte los argumentos JVM extra como lo haría una shell, respetando
// comillas: -Dmi.ruta="C:\Mis Juegos" es UN argumento. Antes se partían
// por espacios y ese tipo de argumento llegaba roto a Java. Las comillas
// se quitan (Java no las espera) y una barra invertida solo escapa a una
// comilla, para no estropear rutas de Windows.
function parseJvmArgs(text) {
    const args = [];
    let current = '';
    let quote = null;
    let hasToken = false;
    const input = typeof text === 'string' ? text : '';
    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (quote) {
            if (ch === '\\' && input[i + 1] === quote) {
                current += quote;
                i++;
            } else if (ch === quote) {
                quote = null;
            } else {
                current += ch;
            }
        } else if (ch === '"' || ch === "'") {
            quote = ch;
            hasToken = true;
        } else if (/\s/.test(ch)) {
            if (hasToken) args.push(current);
            current = '';
            hasToken = false;
        } else {
            current += ch;
            hasToken = true;
        }
    }
    if (hasToken) args.push(current);
    return args;
}

// URL de la página de un proyecto de Modrinth, o null si el tipo o el slug
// no son válidos.
function modrinthProjectUrl(projectType, slug) {
    if (!['mod', 'resourcepack', 'modpack', 'shader'].includes(projectType)) return null;
    if (typeof slug !== 'string' || !/^[A-Za-z0-9!@$()`.+,"\-']{1,64}$/.test(slug) || /^\.+$/.test(slug)) return null;
    return `https://modrinth.com/${projectType}/${encodeURIComponent(slug)}`;
}

module.exports = { sanitizeMemory, normalizeServerAddress, quickPlayForServer, parseJvmArgs, modrinthProjectUrl };
