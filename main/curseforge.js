const { fetchWithTimeout } = require('./httpUtils');

// ============================================================================
// CURSEFORGE: huellas de archivo y datos de instancias locales
// ============================================================================

// Los mods de CurseForge no se descargan ni se suben a nuestro servidor:
// sus condiciones prohíben redistribuir sus archivos o hacer de proxy. Al
// importar una instancia de la app de CurseForge, sus mods se identifican
// en Modrinth por sha1 (suele ser el mismo .jar) y se añaden desde ahí. La
// API de CurseForge, con la key del propio usuario, solo se usa para decir
// el nombre de los mods que no están en Modrinth.

// Huella de CurseForge: MurmurHash2 (semilla 1) del archivo sin los bytes
// de espacio en blanco (tab, salto de línea, retorno de carro y espacio).
function curseForgeFingerprint(buffer) {
    const data = buffer.filter((b) => b !== 9 && b !== 10 && b !== 13 && b !== 32);
    const m = 0x5bd1e995;
    let length = data.length;
    let h = (1 ^ length) >>> 0;
    let i = 0;
    while (length >= 4) {
        let k = data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24);
        k = Math.imul(k, m);
        k ^= k >>> 24;
        k = Math.imul(k, m);
        h = Math.imul(h, m) ^ k;
        i += 4;
        length -= 4;
    }
    switch (length) {
        case 3: h ^= data[i + 2] << 16; // fallthrough
        case 2: h ^= data[i + 1] << 8; // fallthrough
        case 1:
            h ^= data[i];
            h = Math.imul(h, m);
    }
    h ^= h >>> 13;
    h = Math.imul(h, m);
    h ^= h >>> 15;
    return h >>> 0;
}

// baseModLoader.name de minecraftinstance.json: "forge-47.2.0",
// "neoforge-21.1.77", "fabric-0.15.7-1.20.1", "quilt-0.20.2-1.20.1".
function parseCurseForgeLoader(baseModLoaderName) {
    const match = /^(forge|neoforge|fabric|quilt)-(.+)$/.exec(String(baseModLoaderName || '').toLowerCase());
    if (!match) return { loader: 'vanilla', loaderVersion: '' };
    const [, loader, rest] = match;
    // Fabric/Quilt añaden la versión de Minecraft al final.
    const loaderVersion = loader === 'fabric' || loader === 'quilt' ? rest.replace(/-\d+(\.\d+)+$/, '') : rest;
    return { loader, loaderVersion };
}

// Nombres de archivo en CurseForge para unas huellas (las que coinciden).
// Sin API key devuelve {} y no llama a nada.
async function namesForFingerprints(fingerprints, apiKey) {
    if (!apiKey || fingerprints.length === 0) return {};
    const res = await fetchWithTimeout('https://api.curseforge.com/v1/fingerprints/432', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ fingerprints })
    }, 20000);
    if (!res.ok) throw new Error(`CurseForge respondió con estado ${res.status}`);
    const body = await res.json();
    const names = {};
    for (const match of (body.data && body.data.exactMatches) || []) {
        if (match.file) names[match.file.fileFingerprint] = match.file.displayName || match.file.fileName;
    }
    return names;
}

module.exports = { curseForgeFingerprint, parseCurseForgeLoader, namesForFingerprints };
