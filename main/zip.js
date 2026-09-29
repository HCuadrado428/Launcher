const fs = require('fs');
const path = require('path');

// Añade al zip (yazl) todo lo que cuelga de dir, con rutas relativas a base.
// Es asíncrono a propósito: exportar los mundos guardados puede recorrer
// miles de archivos, y con readdirSync eso congelaba el proceso principal
// (y con él toda la ventana) mientras duraba el recorrido. yazl ya lee el
// contenido de cada archivo en streaming al escribir el zip.
async function addDirToZip(zipfile, dir, base) {
    let entries;
    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
        if (err.code === 'ENOENT') return 0;
        throw err;
    }
    let count = 0;
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const rel = `${base}/${entry.name}`;
        if (entry.isDirectory()) {
            count += await addDirToZip(zipfile, full, rel);
        } else {
            zipfile.addFile(full, rel);
            count++;
        }
    }
    return count;
}

// Cierra el zip y lo escribe en destPath; se resuelve cuando el archivo ya
// está entero en disco.
function writeZip(zipfile, destPath) {
    return new Promise((resolve, reject) => {
        zipfile.outputStream.pipe(fs.createWriteStream(destPath))
            .on('close', resolve)
            .on('error', reject);
        zipfile.end();
    });
}

module.exports = { addDirToZip, writeZip };
