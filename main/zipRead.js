const yauzl = require('yauzl');

// Lee en memoria las entradas de un zip que pasen el filtro accept(name),
// con límites de número de entradas y tamaño total (yauzl comprueba además
// que el tamaño real coincide con el declarado). Devuelve [{ name, data }].
function readZipEntries(filePath, { accept, maxEntries = 20000, maxTotalBytes = 512 * 1024 * 1024 }) {
    return new Promise((resolve, reject) => {
        yauzl.open(filePath, { lazyEntries: true }, (openErr, zipfile) => {
            if (openErr) return reject(openErr);
            const entries = [];
            let count = 0;
            let totalBytes = 0;
            const fail = (err) => {
                zipfile.close();
                reject(err);
            };
            zipfile.on('error', fail);
            zipfile.on('end', () => resolve(entries));
            zipfile.on('entry', (entry) => {
                count++;
                if (count > maxEntries) return fail(new Error('El archivo tiene demasiadas entradas.'));
                if (entry.fileName.endsWith('/') || !accept(entry.fileName)) return zipfile.readEntry();
                totalBytes += entry.uncompressedSize;
                if (totalBytes > maxTotalBytes) return fail(new Error('El archivo es demasiado grande.'));
                zipfile.openReadStream(entry, (streamErr, stream) => {
                    if (streamErr) return fail(streamErr);
                    const chunks = [];
                    stream.on('data', (chunk) => chunks.push(chunk));
                    stream.on('error', fail);
                    stream.on('end', () => {
                        entries.push({ name: entry.fileName, data: Buffer.concat(chunks) });
                        zipfile.readEntry();
                    });
                });
            });
            zipfile.readEntry();
        });
    });
}

module.exports = { readZipEntries };
