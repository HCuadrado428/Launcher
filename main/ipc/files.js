const { ipcMain, dialog, nativeImage, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yazl = require('yazl');
const { VANILLA_ROOT, instanceDir } = require('../paths');
const { isSafePathSegment } = require('../utils');
const { loadConfig, saveConfig } = require('../config');
const { normalizeServerAddress } = require('../gameOptions');
const { targetKeyFor } = require('../targetSettings');
const { addDirToZip, writeZip } = require('../zip');
const { getMainWindow } = require('../windowState');
const { tm } = require('../i18nMain');

// ============================================================================
// IPC: ARCHIVOS LOCALES DE CADA INSTALACIÓN (vanilla o un modpack)
// ============================================================================

// Sin id es la instalación vanilla (VANILLA_ROOT).
function installationRoot(id) {
    return id ? instanceDir(id) : VANILLA_ROOT;
}

// --- Galería de capturas de pantalla ---
// screenshots/ lo escribe el propio juego (tecla F2); el launcher solo lo
// lista, abre y borra.
const SCREENSHOT_THUMBNAIL_WIDTH = 320;
const MAX_SCREENSHOTS_LISTED = 120;
const SCREENSHOT_THUMBNAIL_CACHE_SUBDIR = '.thumbnails';

// El nombre de la miniatura cacheada incluye el mtime del original: si el
// archivo cambia, el nombre ya no coincide y se genera una nueva sola.
function screenshotThumbnailCachePath(dir, filename, mtimeMs) {
    return path.join(dir, SCREENSHOT_THUMBNAIL_CACHE_SUBDIR, `${filename}.${Math.round(mtimeMs)}.png`);
}

async function listScreenshots(id) {
    const dir = path.join(installationRoot(id), 'screenshots');
    let names;
    try {
        names = await fs.promises.readdir(dir);
    } catch (err) {
        return [];
    }

    // stat de todas en paralelo (y asíncrono): con cientos de capturas, el
    // statSync de una en una se notaba como un parón de la ventana.
    const stats = await Promise.all(names
        .filter((f) => /\.(png|jpg|jpeg)$/i.test(f))
        .map(async (filename) => {
            try {
                return { filename, mtimeMs: (await fs.promises.stat(path.join(dir, filename))).mtimeMs };
            } catch (err) {
                return null;
            }
        }));
    const files = stats.filter(Boolean)
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, MAX_SCREENSHOTS_LISTED);

    await fs.promises.mkdir(path.join(dir, SCREENSHOT_THUMBNAIL_CACHE_SUBDIR), { recursive: true });

    // Decodificar un PNG de captura a resolución completa cuesta decenas de
    // ms y nativeImage lo hace en el hilo principal: las miniaturas se
    // cachean en disco (la segunda vez es leer un PNG pequeño) y se cede el
    // bucle de eventos entre captura y captura para no congelar la ventana.
    const results = [];
    for (const { filename, mtimeMs } of files) {
        const cachePath = screenshotThumbnailCachePath(dir, filename, mtimeMs);
        let thumbnail = null;
        try {
            const cached = await fs.promises.readFile(cachePath).catch(() => null);
            if (cached) {
                thumbnail = `data:image/png;base64,${cached.toString('base64')}`;
            } else {
                const resized = nativeImage.createFromPath(path.join(dir, filename)).resize({ width: SCREENSHOT_THUMBNAIL_WIDTH });
                await fs.promises.writeFile(cachePath, resized.toPNG());
                thumbnail = resized.toDataURL();
            }
        } catch (err) { /* archivo corrupto o formato no soportado: se omite la miniatura */ }
        results.push({ filename, mtimeMs, thumbnail });
        await new Promise((resolve) => setImmediate(resolve));
    }
    return results;
}

function screenshotPath(id, filename) {
    if (!isSafePathSegment(filename)) throw new Error(tm('sys.invalidFileName'));
    return path.join(installationRoot(id), 'screenshots', filename);
}

async function deleteScreenshot(id, filename) {
    const filePath = screenshotPath(id, filename);
    await fs.promises.unlink(filePath);
    // Borra también cualquier miniatura cacheada de este archivo (el mtime
    // exacto ya no se conoce aquí, así que se buscan por prefijo).
    const cacheDir = path.join(path.dirname(filePath), SCREENSHOT_THUMBNAIL_CACHE_SUBDIR);
    const cached = await fs.promises.readdir(cacheDir).catch(() => []);
    await Promise.all(cached
        .filter((name) => name.startsWith(`${filename}.`))
        .map((name) => fs.promises.unlink(path.join(cacheDir, name)).catch(() => {})));
    return { ok: true };
}

function registerFilesIpc() {
    // Abre en el explorador la carpeta de la instalación (mods, config,
    // saves, screenshots...).
    ipcMain.handle('open-instance-folder', async (event, { id } = {}) => {
        const dir = installationRoot(id);
        await fs.promises.mkdir(dir, { recursive: true });
        shell.openPath(dir);
    });

    ipcMain.handle('list-screenshots', (event, { id } = {}) => listScreenshots(id));
    ipcMain.handle('open-screenshot', (event, { id, filename } = {}) => { shell.openPath(screenshotPath(id, filename)); });
    ipcMain.handle('delete-screenshot', (event, { id, filename } = {}) => deleteScreenshot(id, filename));

    // Exporta los mundos guardados (saves/) a un .zip local. Los mundos son
    // del jugador, no del modpack, así que no dependen de ser el dueño.
    ipcMain.handle('export-saves', async (event, { id, name } = {}) => {
        const savesDir = path.join(installationRoot(id), 'saves');
        const worlds = await fs.promises.readdir(savesDir).catch(() => []);
        if (worlds.length === 0) throw new Error(tm('sys.noSaves'));

        const baseName = (name || 'vanilla').replace(/[\\/:*?"<>|]/g, '_');
        const result = await dialog.showSaveDialog(getMainWindow(), {
            title: tm('sys.dialog.exportSaves'),
            defaultPath: `${tm('sys.savesFileName', { name: baseName })}.zip`,
            filters: [{ name: tm('sys.dialog.zipFilter'), extensions: ['zip'] }]
        });
        if (result.canceled || !result.filePath) return { cancelled: true };

        const zipfile = new yazl.ZipFile();
        const fileCount = await addDirToZip(zipfile, savesDir, 'saves');
        await writeZip(zipfile, result.filePath);
        return { cancelled: false, filePath: result.filePath, fileCount };
    });

    // --- Servidores favoritos (solo locales, no pasan por el backend) ---

    const serversFor = (id) => ((loadConfig().favoriteServers || {})[targetKeyFor(id)] || []);

    const saveServersFor = (id, servers) => {
        const favoriteServers = { ...(loadConfig().favoriteServers || {}) };
        favoriteServers[targetKeyFor(id)] = servers;
        saveConfig({ favoriteServers });
        return servers;
    };

    ipcMain.handle('get-favorite-servers', (event, { id } = {}) => serversFor(id));

    ipcMain.handle('add-favorite-server', (event, { id, name, address } = {}) => {
        const trimmedName = (name || '').trim();
        // La dirección se valida aquí porque luego puede acabar como
        // argumento del juego ("Entrar" en el servidor).
        if (!trimmedName || !(address || '').trim()) throw new Error(tm('sys.serverFieldsMissing'));
        const normalizedAddress = normalizeServerAddress(address);
        if (!normalizedAddress) throw new Error(tm('sys.invalidServerAddress'));
        return saveServersFor(id, [...serversFor(id), { id: crypto.randomUUID(), name: trimmedName, address: normalizedAddress }]);
    });

    ipcMain.handle('remove-favorite-server', (event, { id, serverId } = {}) =>
        saveServersFor(id, serversFor(id).filter((s) => s.id !== serverId)));
}

module.exports = { registerFilesIpc };
