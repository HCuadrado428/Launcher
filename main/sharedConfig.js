const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const yauzl = require('yauzl');
const { isSafePathSegment } = require('./utils');

// ============================================================================
// APLICAR LA CONFIG COMPARTIDA POR EL DUEÑO DE UN MODPACK
// ============================================================================

// El .zip lo genera "Compartir mi config" en el ordenador del dueño, pero
// llega desde el servidor y se descomprime dentro de la instancia de cada
// jugador. Antes se extraía entero tal cual, así que un zip manipulado podía
// escribir en mods/ o, peor, en libraries/ y assets/, que son enlaces al
// almacén compartido con vanilla y el resto de modpacks. Ahora solo se
// aceptan las dos cosas que "Compartir mi config" mete de verdad.
const MAX_ENTRIES = 5000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

// Devuelve { parts, isDirectory } si la entrada está permitida, o null si se
// debe ignorar.
function sharedConfigEntryTarget(entryName) {
    const isDirectory = entryName.endsWith('/');
    const parts = entryName.split('/');
    if (isDirectory) parts.pop();
    if (parts.length === 0 || !parts.every(isSafePathSegment)) return null;

    const allowed = parts[0] === 'config'
        ? (parts.length > 1 || isDirectory)
        : (parts.length === 1 && parts[0] === 'options.txt' && !isDirectory);
    return allowed ? { parts, isDirectory } : null;
}

// Si alguna carpeta intermedia ya existe como enlace simbólico/junction,
// escribir dentro acabaría fuera de la instancia.
async function assertNoLinkOnPath(rootDir, dirParts) {
    for (let i = 1; i <= dirParts.length; i++) {
        const current = path.join(rootDir, ...dirParts.slice(0, i));
        let stat;
        try {
            stat = await fs.promises.lstat(current);
        } catch (err) {
            return; // no existe todavía: lo que cuelgue de aquí se creará como carpeta real
        }
        if (stat.isSymbolicLink()) {
            throw new Error(`La config compartida intenta escribir a través de un enlace (${dirParts.slice(0, i).join('/')}).`);
        }
    }
}

function openZip(buffer) {
    return new Promise((resolve, reject) => {
        yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => (err ? reject(err) : resolve(zipfile)));
    });
}

function openEntryStream(zipfile, entry) {
    return new Promise((resolve, reject) => {
        zipfile.openReadStream(entry, (err, stream) => (err ? reject(err) : resolve(stream)));
    });
}

// Descomprime en destDir solo config/** y options.txt. Devuelve cuántos
// archivos se escribieron. Lanza si el zip está corrupto, es demasiado grande
// o intenta escribir a través de un enlace.
async function extractSharedConfigZip(buffer, destDir) {
    const zipfile = await openZip(buffer);
    let entryCount = 0;
    let totalBytes = 0;
    let written = 0;

    const handleEntry = async (entry) => {
        entryCount++;
        if (entryCount > MAX_ENTRIES) throw new Error('La config compartida tiene demasiados archivos.');

        const target = sharedConfigEntryTarget(entry.fileName);
        if (!target) return;

        const dirParts = target.isDirectory ? target.parts : target.parts.slice(0, -1);
        await assertNoLinkOnPath(destDir, dirParts);
        const destPath = path.join(destDir, ...target.parts);
        if (target.isDirectory) {
            await fs.promises.mkdir(destPath, { recursive: true });
            return;
        }

        totalBytes += entry.uncompressedSize;
        if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) throw new Error('La config compartida es demasiado grande.');

        await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
        // Si el archivo de destino es un enlace, se sustituye por un archivo
        // normal en vez de escribir en lo que apunte.
        const existing = await fs.promises.lstat(destPath).catch(() => null);
        if (existing && existing.isSymbolicLink()) await fs.promises.unlink(destPath);

        // yauzl comprueba por defecto (validateEntrySizes) que el tamaño real
        // coincide con el declarado, así que totalBytes no se puede falsear.
        const stream = await openEntryStream(zipfile, entry);
        await pipeline(stream, fs.createWriteStream(destPath));
        written++;
    };

    try {
        await new Promise((resolve, reject) => {
            zipfile.on('error', reject);
            zipfile.on('end', resolve);
            zipfile.on('entry', (entry) => {
                handleEntry(entry).then(() => zipfile.readEntry(), reject);
            });
            zipfile.readEntry();
        });
    } finally {
        zipfile.close();
    }
    return written;
}

module.exports = { extractSharedConfigZip, sharedConfigEntryTarget };
