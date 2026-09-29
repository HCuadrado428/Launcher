const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yazl = require('yazl');
const { instanceDir, instanceModsDir, instanceResourcePacksDir } = require('../paths');
const { runWithConcurrencyLimit, formatBytesMain } = require('../utils');
const { apiPath } = require('../httpUtils');
const { loadConfig, saveConfig } = require('../config');
const { curseForgeFingerprint, namesForFingerprints } = require('../curseforge');
const { apiRequest, uploadForm } = require('../backend');
const { getLoaderVersionsForMc } = require('../loaders');
const { isSupportedLoader } = require('../loaderVersions');
const { searchModrinth } = require('../modrinth');
const { addModFromModrinth, addModrinthDependencies, updateMod } = require('../modUpdates');
const { exportMrpack, importMrpack } = require('../mrpack');
const { findCurseForgeInstances, findModrinthInstances } = require('../localScan');
const { syncModpack, repairModpack, verifyModpackFiles, wipeInstanceAfterLeaving, checkLocalInstanceHealth } = require('../modpackSync');
const { assertInstanceNotInUse } = require('../game');
const { addDirToZip, writeZip } = require('../zip');
const { getMainWindow, sendToWindow } = require('../windowState');
const { tm } = require('../i18nMain');

// ============================================================================
// IPC: MODPACKS
// ============================================================================

// Los tokens de invitación que genera el backend son un único segmento de
// URL (letras, números, "-", "_"...). Cualquier otra cosa (un deep link
// manipulado o algo pegado a mano en el campo de invitación) se rechaza en
// vez de meterla en la ruta de una petición al backend.
const INVITE_TOKEN_RE = /^[A-Za-z0-9._~+=-]{1,256}$/;

function isValidInviteToken(token) {
    return typeof token === 'string' && INVITE_TOKEN_RE.test(token) && !/^\.+$/.test(token);
}

function safeFileBaseName(name, fallback) {
    return (name || fallback).replace(/[\\/:*?"<>|]/g, '_');
}

const COVER_MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const COVER_MAX_BYTES = 250 * 1024;

// Se guarda en memoria entre el escaneo y la importación para no tener que
// volver a mandar (ni recalcular) la lista completa de mods resueltos por
// IPC dos veces.
let lastScannedInstances = [];

// Nombres legibles de los mods que no se pudieron añadir (no están en
// Modrinth), para que el jugador sepa cuáles tendrá que añadir a mano. En
// instancias de CurseForge, con la API key del propio usuario se piden sus
// nombres reales a CurseForge; si no, se usa el nombre del archivo.
async function unresolvedModNames(instance) {
    const files = instance.unresolvedFiles || [];
    const apiKey = loadConfig().curseforgeApiKey;
    if (instance.source !== 'curseforge' || !apiKey || files.length === 0) return files;
    try {
        const byFingerprint = new Map();
        for (const fileName of files) {
            const data = await fs.promises.readFile(path.join(instance.path, 'mods', fileName));
            byFingerprint.set(curseForgeFingerprint(data), fileName);
        }
        const names = await namesForFingerprints([...byFingerprint.keys()], apiKey);
        return [...byFingerprint.entries()].map(([fingerprint, fileName]) => names[fingerprint] || fileName);
    } catch (err) {
        console.warn('[WARN] No se pudieron consultar los nombres en CurseForge:', err.message);
        return files;
    }
}

function registerModpacksIpc() {
    ipcMain.handle('get-loader-versions', (event, { loader, mcVersion } = {}) => getLoaderVersionsForMc(loader, mcVersion));

    ipcMain.handle('modpacks-create', (event, { name, mcVersion, loader, loaderVersion } = {}) => {
        if (!isSupportedLoader(loader)) throw new Error(tm('sys.unsupportedLoader', { loader }));
        return apiRequest('/api/modpacks', {
            method: 'POST',
            body: { name, mc_version: mcVersion, loader, loader_version: loaderVersion }
        });
    });

    ipcMain.handle('modpacks-delete', async (event, { id } = {}) => {
        assertInstanceNotInUse(id);
        const result = await apiRequest(apiPath`/api/modpacks/${id}`, { method: 'DELETE' });
        // El modpack ya no existe en el servidor: no tiene sentido dejar sus
        // mods/librerías ocupando disco (saves/config/screenshots se quedan).
        await wipeInstanceAfterLeaving(id);
        return result;
    });

    ipcMain.handle('modpacks-leave', async (event, { id } = {}) => {
        assertInstanceNotInUse(id);
        const result = await apiRequest(apiPath`/api/modpacks/${id}/leave`, { method: 'POST' });
        await wipeInstanceAfterLeaving(id);
        return result;
    });

    ipcMain.handle('modpacks-mine', () => apiRequest('/api/modpacks/mine'));
    ipcMain.handle('modpacks-manifest', (event, { id } = {}) => apiRequest(apiPath`/api/modpacks/${id}/manifest`));
    ipcMain.handle('get-storage-usage', () => apiRequest('/api/modpacks/storage'));

    ipcMain.handle('modpacks-check-health', (event, { id } = {}) => checkLocalInstanceHealth(id));

    ipcMain.handle('modpacks-sync', (event, { id } = {}) => {
        assertInstanceNotInUse(id);
        return syncModpack(id);
    });

    ipcMain.handle('modpacks-repair', (event, { id } = {}) => {
        assertInstanceNotInUse(id);
        return repairModpack(id);
    });

    ipcMain.handle('modpacks-verify-files', (event, { id } = {}) => {
        assertInstanceNotInUse(id);
        return verifyModpackFiles(id);
    });

    ipcMain.handle('modpacks-select', (event, { id, name, mcVersion, loader, loaderVersion } = {}) => {
        saveConfig({
            activeModpack: id
                ? { id, name, mc_version: mcVersion, loader: loader || 'vanilla', loader_version: loaderVersion || '' }
                : null
        });
        return true;
    });

    // --- Mods ---

    ipcMain.handle('modpacks-add-mod', async (event, { id, type } = {}) => {
        const isResourcePack = type === 'resourcepack';
        const result = await dialog.showOpenDialog(getMainWindow(), {
            title: tm(isResourcePack ? 'sys.dialog.resourcepackFiles' : 'sys.dialog.modFiles'),
            properties: ['openFile', 'multiSelections'],
            filters: [{
                name: tm(isResourcePack ? 'sys.dialog.resourcepackFilter' : 'sys.dialog.modFilter'),
                extensions: [isResourcePack ? 'zip' : 'jar']
            }]
        });
        if (result.canceled || result.filePaths.length === 0) return { cancelled: true };

        const uploaded = [];
        for (const filePath of result.filePaths) {
            const fileName = path.basename(filePath);
            const form = new FormData();
            // "type" tiene que ir antes que "mod": multer procesa el multipart
            // en orden y solo ve los campos ya leídos cuando decide si el
            // archivo pasa el filtro de extensión.
            form.append('type', isResourcePack ? 'resourcepack' : 'mod');
            form.append('mod', new Blob([await fs.promises.readFile(filePath)]), fileName);
            uploaded.push(await uploadForm(apiPath`/api/modpacks/${id}/mods`, form, {
                fallbackError: tm('sys.uploadFailed', { file: fileName })
            }));
        }
        return { cancelled: false, uploaded };
    });

    ipcMain.handle('modpacks-remove-mod', (event, { id, modId } = {}) =>
        apiRequest(apiPath`/api/modpacks/${id}/mods/${modId}`, { method: 'DELETE' }));

    ipcMain.handle('modpacks-check-mod-update', (event, { id, modId } = {}) =>
        apiRequest(apiPath`/api/modpacks/${id}/mods/${modId}/check-update`));

    ipcMain.handle('search-modrinth', (event, { query, mcVersion, loader, projectType } = {}) =>
        searchModrinth(query, mcVersion, loader, projectType));

    ipcMain.handle('add-mod-from-modrinth', (event, options = {}) => addModFromModrinth(options));

    ipcMain.handle('add-modrinth-dependencies', (event, { id, projectIds, mcVersion, loader } = {}) =>
        addModrinthDependencies({ id, projectIds: Array.isArray(projectIds) ? projectIds.map(String) : [], mcVersion, loader }));

    ipcMain.handle('modpacks-update-mod', (event, { id, modId, mcVersion, loader } = {}) => updateMod({ id, modId, mcVersion, loader }));

    // --- Importar instancias locales (CurseForge App / Modrinth App) ---

    ipcMain.handle('scan-local-modpacks', async () => {
        const instances = [...await findCurseForgeInstances(), ...await findModrinthInstances()];
        lastScannedInstances = instances;
        // No se mandan las listas de mods (pueden ser largas) al renderer,
        // solo lo necesario para la lista; se recuperan por "path" al importar.
        return instances.map(({ resolvedMods, unresolvedFiles, ...rest }) => rest);
    });

    ipcMain.handle('import-local-modpack', async (event, { instancePath } = {}) => {
        const instance = lastScannedInstances.find((i) => i.path === instancePath);
        if (!instance) throw new Error(tm('sys.instanceNotFound'));

        const created = await apiRequest('/api/modpacks', {
            method: 'POST',
            body: { name: instance.name, mc_version: instance.mcVersion, loader: instance.loader, loader_version: instance.loaderVersion || '' }
        });

        let imported = 0;
        let skipped = 0;
        const total = instance.resolvedMods.length;
        // Cada mod es una llamada independiente al backend; varias a la vez
        // en vez de pagar la latencia completa mod a mod.
        await runWithConcurrencyLimit(instance.resolvedMods, 6, async (mod) => {
            try {
                await apiRequest(apiPath`/api/modpacks/${created.id}/mods/from-modrinth`, {
                    method: 'POST',
                    body: { project_id: mod.projectId, version_id: mod.versionId, type: 'mod' }
                });
                imported++;
            } catch (err) {
                skipped++;
            }
            const done = imported + skipped;
            sendToWindow('modpack-sync-progress', {
                label: tm('sys.progress.importing', { done, total }),
                percent: total > 0 ? Math.round((done / total) * 100) : 100,
                modpackId: created.id
            });
        });

        return {
            modpack: created,
            imported,
            skipped,
            unresolvedCount: instance.unresolvedFiles.length,
            unresolvedNames: await unresolvedModNames(instance)
        };
    });

    // --- Invitaciones, accesos e historial ---

    ipcMain.handle('modpacks-create-invite', (event, { id, maxUses, expiresHours } = {}) =>
        apiRequest(apiPath`/api/modpacks/${id}/invite`, {
            method: 'POST',
            body: { max_uses: maxUses || null, expires_in_hours: expiresHours || null }
        }));

    ipcMain.handle('modpacks-list-invites', (event, { id } = {}) => apiRequest(apiPath`/api/modpacks/${id}/invites`));

    ipcMain.handle('modpacks-revoke-invite', (event, { id, token } = {}) =>
        apiRequest(apiPath`/api/modpacks/${id}/invites/${token}`, { method: 'DELETE' }));

    ipcMain.handle('modpacks-redeem-invite', (event, { token } = {}) => {
        if (!isValidInviteToken(token)) throw new Error(tm('sys.invalidInvite'));
        return apiRequest(apiPath`/api/invites/${token}/redeem`, { method: 'POST' });
    });

    ipcMain.handle('modpacks-list-access', (event, { id } = {}) => apiRequest(apiPath`/api/modpacks/${id}/access`));

    ipcMain.handle('modpacks-revoke-access', (event, { id, uuid } = {}) =>
        apiRequest(apiPath`/api/modpacks/${id}/access/${uuid}`, { method: 'DELETE' }));

    ipcMain.handle('modpacks-list-versions', (event, { id } = {}) => apiRequest(apiPath`/api/modpacks/${id}/versions`));

    ipcMain.handle('modpacks-restore-version', (event, { id, versionId } = {}) =>
        apiRequest(apiPath`/api/modpacks/${id}/versions/${versionId}/restore`, { method: 'POST' }));

    // --- Exportar, portada y config compartida ---

    // Exporta los mods y resource packs ya descargados a un .zip local, como
    // copia de seguridad. No incluye librerías/assets de Forge o Fabric: se
    // pueden reinstalar y ocuparían muchísimo más que los propios mods.
    ipcMain.handle('modpacks-export', async (event, { id, name } = {}) => {
        const result = await dialog.showSaveDialog(getMainWindow(), {
            title: tm('sys.dialog.exportModpack'),
            defaultPath: `${safeFileBaseName(name, 'modpack')}.zip`,
            filters: [{ name: tm('sys.dialog.zipFilter'), extensions: ['zip'] }]
        });
        if (result.canceled || !result.filePath) return { cancelled: true };

        const zipfile = new yazl.ZipFile();
        const fileCount = await addDirToZip(zipfile, instanceModsDir(id), 'mods')
            + await addDirToZip(zipfile, instanceResourcePacksDir(id), 'resourcepacks');
        await writeZip(zipfile, result.filePath);
        return { cancelled: false, filePath: result.filePath, fileCount };
    });

    // .mrpack (formato de Modrinth): exportar la instalación local para
    // abrirla en otros launchers, o crear un modpack nuevo desde uno.
    ipcMain.handle('modpacks-export-mrpack', async (event, { id, name } = {}) => {
        const result = await dialog.showSaveDialog(getMainWindow(), {
            title: tm('sys.dialog.exportModpack'),
            defaultPath: `${safeFileBaseName(name, 'modpack')}.mrpack`,
            filters: [{ name: tm('sys.dialog.mrpackFilter'), extensions: ['mrpack'] }]
        });
        if (result.canceled || !result.filePath) return { cancelled: true };
        return { cancelled: false, ...(await exportMrpack(id, name, result.filePath)) };
    });

    ipcMain.handle('import-mrpack', async () => {
        const result = await dialog.showOpenDialog(getMainWindow(), {
            title: tm('sys.dialog.importMrpack'),
            properties: ['openFile'],
            filters: [{ name: tm('sys.dialog.mrpackFilter'), extensions: ['mrpack'] }]
        });
        if (result.canceled || result.filePaths.length === 0) return { cancelled: true };
        return { cancelled: false, ...(await importMrpack(result.filePaths[0])) };
    });

    ipcMain.handle('modpacks-set-cover', async (event, { id } = {}) => {
        const result = await dialog.showOpenDialog(getMainWindow(), {
            title: tm('sys.dialog.chooseCover'),
            properties: ['openFile'],
            filters: [{ name: tm('sys.dialog.imageFilter'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
        });
        if (result.canceled || result.filePaths.length === 0) return { cancelled: true };

        const filePath = result.filePaths[0];
        const mime = COVER_MIME_BY_EXT[path.extname(filePath).toLowerCase()];
        if (!mime) throw new Error(tm('sys.imageUnsupported'));

        const stat = await fs.promises.stat(filePath);
        if (stat.size > COVER_MAX_BYTES) {
            throw new Error(tm('sys.imageTooBig', { size: formatBytesMain(stat.size), max: formatBytesMain(COVER_MAX_BYTES) }));
        }

        const dataUri = `data:${mime};base64,${(await fs.promises.readFile(filePath)).toString('base64')}`;
        await apiRequest(apiPath`/api/modpacks/${id}/cover`, { method: 'PUT', body: { cover_image: dataUri } });
        return { cancelled: false, coverImage: dataUri };
    });

    // "Compartir mi config": empaqueta la config/ + options.txt LOCALES del
    // dueño en un .zip y lo sube al backend. Solo se aplica en el ordenador
    // de los demás la primera vez que sincronizan este modpack (ver
    // applySharedConfigIfNeeded), para no pisar cambios que cada jugador
    // haga después por su cuenta.
    ipcMain.handle('modpacks-share-config', async (event, { id } = {}) => {
        const dir = instanceDir(id);
        const configDir = path.join(dir, 'config');
        const optionsPath = path.join(dir, 'options.txt');
        const hasConfig = fs.existsSync(configDir);
        const hasOptions = fs.existsSync(optionsPath);
        if (!hasConfig && !hasOptions) throw new Error(tm('sys.noLocalConfig'));

        const zipfile = new yazl.ZipFile();
        if (hasConfig) await addDirToZip(zipfile, configDir, 'config');
        if (hasOptions) zipfile.addFile(optionsPath, 'options.txt');

        const tmpZipPath = path.join(os.tmpdir(), `ember-launcher-shared-config-${Date.now()}.zip`);
        await writeZip(zipfile, tmpZipPath);
        try {
            const form = new FormData();
            form.append('config', new Blob([await fs.promises.readFile(tmpZipPath)]), 'config.zip');
            return await uploadForm(apiPath`/api/modpacks/${id}/config`, form, {
                method: 'PUT',
                fallbackError: tm('sys.configUploadFailed')
            });
        } finally {
            fs.promises.rm(tmpZipPath, { force: true }).catch(() => {});
        }
    });

    ipcMain.handle('modpacks-remove-config', (event, { id } = {}) =>
        apiRequest(apiPath`/api/modpacks/${id}/config`, { method: 'DELETE' }));
}

module.exports = { registerModpacksIpc, isValidInviteToken };
