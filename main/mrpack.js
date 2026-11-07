const fs = require('fs');
const os = require('os');
const path = require('path');
const yazl = require('yazl');
const { instanceDir, instanceModFilePath } = require('./paths');
const { runWithConcurrencyLimit } = require('./utils');
const { apiPath, downloadToFile } = require('./httpUtils');
const { apiRequest, uploadForm } = require('./backend');
const { getVersionsByHashes } = require('./modrinth');
const { loadInstanceMeta } = require('./modpackSync');
const { addDirToZip, writeZip } = require('./zip');
const { readZipEntries } = require('./zipRead');
const { sendToWindow } = require('./windowState');
const { tm } = require('./i18nMain');
const {
    loaderFromDependencies,
    dependenciesFor,
    loaderVersionFromId,
    isAllowedMrpackDownload,
    classifyPackPath,
    overrideRelPath,
    validateIndex
} = require('./mrpackFormat');

// ============================================================================
// IMPORTAR / EXPORTAR MODPACKS EN FORMATO .mrpack (Modrinth)
// ============================================================================

// --- Exportar ---

// Genera un .mrpack a partir de la instalación local (ya sincronizada) de
// un modpack: los mods que están en Modrinth van como enlaces de descarga
// en modrinth.index.json; los que no (subidos a mano) y la config/ +
// options.txt locales van dentro, en overrides/. Así el .mrpack se puede
// abrir en Modrinth App, Prism Launcher, ATLauncher...
async function exportMrpack(modpackId, name, destPath) {
    const meta = loadInstanceMeta(modpackId);
    const mods = meta.mods || [];
    const byHash = await getVersionsByHashes(mods.map((m) => m.sha1).filter(Boolean));

    const zipfile = new yazl.ZipFile();
    const files = [];
    let overrideCount = 0;
    for (const mod of mods) {
        const folder = mod.type === 'resourcepack' ? 'resourcepacks' : 'mods';
        const version = byHash[mod.sha1];
        const file = version && (version.files || []).find((f) => f.hashes && f.hashes.sha1 === mod.sha1);
        if (file && isAllowedMrpackDownload(file.url)) {
            files.push({
                path: `${folder}/${mod.filename}`,
                hashes: { sha1: file.hashes.sha1, sha512: file.hashes.sha512 },
                downloads: [file.url],
                fileSize: file.size
            });
        } else {
            const localPath = instanceModFilePath(modpackId, mod);
            if (fs.existsSync(localPath)) {
                zipfile.addFile(localPath, `overrides/${folder}/${mod.filename}`);
                overrideCount++;
            }
        }
    }

    const dir = instanceDir(modpackId);
    overrideCount += await addDirToZip(zipfile, path.join(dir, 'config'), 'overrides/config');
    if (fs.existsSync(path.join(dir, 'options.txt'))) {
        zipfile.addFile(path.join(dir, 'options.txt'), 'overrides/options.txt');
        overrideCount++;
    }

    const loader = meta.loader || 'vanilla';
    const loaderVersion = meta.requested_loader_version || loaderVersionFromId(loader, meta.loader_version_id);
    const index = {
        formatVersion: 1,
        game: 'minecraft',
        versionId: meta.version_hash ? String(meta.version_hash).slice(0, 12) : '1.0.0',
        name: name || 'Modpack',
        summary: 'Exportado con Ember Launcher',
        files,
        dependencies: dependenciesFor(meta.mc_version, loader, loaderVersion)
    };
    zipfile.addBuffer(Buffer.from(JSON.stringify(index, null, 2)), 'modrinth.index.json');
    await writeZip(zipfile, destPath);
    return { linked: files.length, included: overrideCount };
}

// --- Importar ---

function sendImportProgress(modpackId, done, total) {
    sendToWindow('modpack-sync-progress', {
        label: tm('sys.progress.importing', { done, total }),
        percent: total > 0 ? Math.round((done / total) * 100) : 100,
        modpackId
    });
}

async function uploadFile(modpackId, kind, fileName, data) {
    const form = new FormData();
    // "type" antes que el archivo: multer decide el filtro de extensión con
    // los campos ya leídos (ver modpacks-add-mod).
    form.append('type', kind);
    form.append('mod', new Blob([data]), fileName);
    await uploadForm(apiPath`/api/modpacks/${modpackId}/mods`, form, { fallbackError: tm('sys.uploadFailed', { file: fileName }) });
}

async function downloadToBuffer(url, sha1) {
    const tmpPath = path.join(os.tmpdir(), `ember-mrpack-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    try {
        await downloadToFile(url, tmpPath, { expectedSha1: sha1 });
        return await fs.promises.readFile(tmpPath);
    } finally {
        await fs.promises.rm(tmpPath, { force: true });
    }
}

// Crea un modpack nuevo a partir de un .mrpack:
// - Mods/resource packs del índice que están en Modrinth → se añaden desde
//   Modrinth (se identifican por sha1).
// - Los que no, si tienen una descarga permitida → se descargan (con sha1
//   comprobado) y se suben al modpack.
// - overrides/mods y overrides/resourcepacks → se suben.
// - overrides/config y options.txt → se publican como config compartida.
// - Todo lo demás (shaderpacks, scripts, archivos solo de servidor...) se
//   ignora y se cuenta en "skipped".
async function importMrpack(filePath) {
    const entries = await readZipEntries(filePath, {
        accept: (name) => name === 'modrinth.index.json' || Boolean(overrideRelPath(name))
    });
    const indexEntry = entries.find((e) => e.name === 'modrinth.index.json');
    let index;
    try {
        index = validateIndex(indexEntry && JSON.parse(indexEntry.data.toString('utf-8')));
    } catch (err) {
        throw new Error(tm('sys.mrpackInvalid'), { cause: err });
    }

    const { loader, loaderVersion } = loaderFromDependencies(index.dependencies);
    const created = await apiRequest('/api/modpacks', {
        method: 'POST',
        body: { name: String(index.name || path.basename(filePath, '.mrpack')).slice(0, 100), mc_version: index.dependencies.minecraft, loader, loader_version: loaderVersion }
    });

    let skipped = 0;
    const indexFiles = [];
    for (const file of index.files) {
        const target = classifyPackPath(file.path);
        const clientUnsupported = file.env && file.env.client === 'unsupported';
        if (!target || target.kind === 'config' || clientUnsupported || !file.hashes || !file.hashes.sha1) {
            skipped++;
        } else {
            indexFiles.push({ ...file, target });
        }
    }

    // client-overrides pisa a overrides para la misma ruta.
    const overrides = new Map();
    for (const entry of entries) {
        const override = overrideRelPath(entry.name);
        if (!override) continue;
        const target = classifyPackPath(override.relPath);
        if (!target) {
            skipped++;
            continue;
        }
        if (!overrides.has(override.relPath) || override.clientOnly) overrides.set(override.relPath, { target, data: entry.data });
    }
    const overrideFiles = [...overrides.values()].filter((o) => o.target.kind !== 'config');
    const configFiles = [...overrides.entries()].filter(([, o]) => o.target.kind === 'config');

    const total = indexFiles.length + overrideFiles.length + (configFiles.length ? 1 : 0);
    let done = 0;
    const step = () => sendImportProgress(created.id, ++done, total);

    const byHash = await getVersionsByHashes(indexFiles.map((f) => f.hashes.sha1)).catch(() => ({}));
    let fromModrinth = 0;
    let uploaded = 0;
    await runWithConcurrencyLimit(indexFiles, 4, async (file) => {
        try {
            const version = byHash[file.hashes.sha1];
            if (version) {
                await apiRequest(apiPath`/api/modpacks/${created.id}/mods/from-modrinth`, {
                    method: 'POST',
                    body: { project_id: version.project_id, version_id: version.id, type: file.target.kind }
                });
                fromModrinth++;
            } else {
                const url = (file.downloads || []).find(isAllowedMrpackDownload);
                if (!url) throw new Error('sin descarga permitida');
                await uploadFile(created.id, file.target.kind, file.target.fileName, await downloadToBuffer(url, file.hashes.sha1));
                uploaded++;
            }
        } catch (err) {
            console.warn(`[WARN] No se pudo importar ${file.path}:`, err.message);
            skipped++;
        }
        step();
    });

    for (const { target, data } of overrideFiles) {
        try {
            await uploadFile(created.id, target.kind, target.fileName, data);
            uploaded++;
        } catch (err) {
            console.warn(`[WARN] No se pudo subir ${target.fileName}:`, err.message);
            skipped++;
        }
        step();
    }

    let configShared = false;
    if (configFiles.length) {
        try {
            const zipfile = new yazl.ZipFile();
            for (const [relPath, { data }] of configFiles) zipfile.addBuffer(data, relPath);
            const chunks = [];
            zipfile.outputStream.on('data', (chunk) => chunks.push(chunk));
            const finished = new Promise((resolve, reject) => {
                zipfile.outputStream.on('end', resolve);
                zipfile.outputStream.on('error', reject);
            });
            zipfile.end();
            await finished;
            const form = new FormData();
            form.append('config', new Blob([Buffer.concat(chunks)]), 'config.zip');
            await uploadForm(apiPath`/api/modpacks/${created.id}/config`, form, { method: 'PUT', fallbackError: tm('sys.configUploadFailed') });
            configShared = true;
        } catch (err) {
            console.warn('[WARN] No se pudo compartir la config del .mrpack:', err.message);
        }
        step();
    }

    return { modpack: created, fromModrinth, uploaded, skipped, configShared };
}

module.exports = { exportMrpack, importMrpack };
