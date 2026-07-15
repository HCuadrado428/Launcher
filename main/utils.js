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
    formatBytesMain,
    getFreeDiskSpaceBytes
};
