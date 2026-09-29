const fs = require('fs');
const crypto = require('crypto');

function parseVersionFromDirName(name) {
    const matches = name.match(/\d+/g);
    return matches ? matches.map(Number) : [0];
}

function compareVersionArrays(a, b) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const x = a[i] || 0;
        const y = b[i] || 0;
        if (x !== y) return x - y;
    }
    return 0;
}

function sha1File(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha1');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

// Ejecuta "worker" sobre cada elemento de "items" con como mucho "limit" en
// vuelo a la vez, en vez de todos de golpe (Promise.all sin límite) o de uno
// en uno (un simple for/await). Si algún worker lanza, el error se propaga
// tal cual (los demás que ya estaban en marcha terminan, pero no se lanzan
// nuevos).
async function runWithConcurrencyLimit(items, limit, worker) {
    const queue = [...items];
    const runnerCount = Math.min(limit, queue.length);
    const runners = new Array(runnerCount).fill(null).map(async () => {
        while (queue.length > 0) {
            const item = queue.shift();
            await worker(item);
        }
    });
    await Promise.all(runners);
}

// Ordena ids de versión de Minecraft de más nueva a más antigua, poniendo
// primero las releases ("1.21.1", "26.1"...) y después cualquier otra cosa
// (snapshots, carpetas raras). fs.readdirSync no garantiza ningún orden útil,
// así que sin esto "la primera instalada" podía ser la más antigua.
const RELEASE_VERSION_ID_RE = /^\d+\.\d+(\.\d+)?$/;

function sortVersionIdsNewestFirst(ids) {
    const newestFirst = (a, b) => compareVersionArrays(parseVersionFromDirName(b), parseVersionFromDirName(a));
    const releases = ids.filter((id) => RELEASE_VERSION_ID_RE.test(id)).sort(newestFirst);
    const others = ids.filter((id) => !RELEASE_VERSION_ID_RE.test(id)).sort(newestFirst);
    return [...releases, ...others];
}

// Un único componente de ruta que se puede unir a una carpeta sin salirse de
// ella: sin separadores, sin ":" (unidad o flujo alternativo de NTFS), sin
// caracteres de control, y sin acabar en punto o espacio (Windows los
// recorta, así que ".. " acabaría siendo ".."). Se usa para todo lo que
// viene de fuera y acaba en una ruta de disco: ids de modpack y nombres de
// archivo que manda el servidor.
function isSafePathSegment(value) {
    if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
    if (typeof value !== 'string' || value.length === 0 || value.length > 255) return false;
    if (/[\\/:]/.test(value) || /[. ]$/.test(value)) return false;
    for (let i = 0; i < value.length; i++) {
        if (value.charCodeAt(i) < 32) return false;
    }
    return true;
}

function assertSafePathSegment(value, what) {
    if (!isSafePathSegment(value)) {
        throw new Error(`${what} no válido: ${JSON.stringify(value)}.`);
    }
    return String(value);
}

// minecraft-launcher-core escribe en su log de depuración la línea de
// comandos completa del juego, access token de Microsoft incluido. Ese log
// acaba en la consola y en los crash logs que la gente comparte para pedir
// ayuda, así que se tapa antes de guardarlo en ningún sitio.
function redactSecrets(text) {
    return String(text).replace(/(--accessToken[\s,=]+)[^\s,\]]+/gi, '$1***');
}

// launch() de minecraft-launcher-core nunca lanza: si algo falla, lo cuenta
// en un evento "debug" y devuelve null. Esto saca el motivo de esa línea
// para poder enseñárselo al usuario.
const MCLC_LAUNCH_FAILURE_RE = /^\[MCLC\]: (?:Couldn't start Minecraft due to:?|Failed to start due to)\s*(.+?)(?:, closing\.\.\.)?$/s;

function parseMclcLaunchFailure(debugLine) {
    const match = MCLC_LAUNCH_FAILURE_RE.exec(String(debugLine).trim());
    return match ? match[1].trim() : null;
}

// Escribe un archivo de forma atómica: primero a un temporal (con fsync) y
// luego rename encima del original. Si el proceso muere a mitad, se queda el
// archivo anterior entero en vez de uno a medias. Si el rename falla (en
// Windows, un antivirus o el indexador pueden tener el destino abierto) se
// cae a la escritura directa de siempre antes que perder el guardado.
function writeFileAtomicSync(filePath, data) {
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    const fd = fs.openSync(tmpPath, 'w');
    try {
        fs.writeSync(fd, typeof data === 'string' ? Buffer.from(data, 'utf-8') : data);
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    try {
        fs.renameSync(tmpPath, filePath);
    } catch (err) {
        try { fs.unlinkSync(tmpPath); } catch (unlinkErr) { /* ya no estaba */ }
        fs.writeFileSync(filePath, data);
    }
}

function formatBytesMain(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = -1;
    do {
        value /= 1024;
        unitIndex++;
    } while (value >= 1024 && unitIndex < units.length - 1);
    return `${value.toFixed(1)} ${units[unitIndex]}`;
}

// Espacio libre en el disco que contiene targetPath, en bytes, o null si no
// se pudo determinar (p.ej. Node sin fs.statfsSync, o ruta inexistente). Es
// solo un aviso preventivo, así que nunca debe poder romper el flujo normal.
function getFreeDiskSpaceBytes(targetPath) {
    try {
        fs.mkdirSync(targetPath, { recursive: true });
        const stats = fs.statfsSync(targetPath);
        return stats.bavail * stats.bsize;
    } catch (err) {
        return null;
    }
}

module.exports = {
    parseVersionFromDirName,
    compareVersionArrays,
    sha1File,
    runWithConcurrencyLimit,
    sortVersionIdsNewestFirst,
    isSafePathSegment,
    assertSafePathSegment,
    redactSecrets,
    parseMclcLaunchFailure,
    writeFileAtomicSync,
    formatBytesMain,
    getFreeDiskSpaceBytes
};
