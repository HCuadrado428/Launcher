const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Client, Authenticator } = require('minecraft-launcher-core');
const launcher = new Client();

const {
    installForge,
    installFabric,
    getLoaderArtifactListFor,
    installDependencies,
    installVersion,
    getVersionList
} = require('@xmcl/installer');
const { Version } = require('@xmcl/core');
const { autoUpdater } = require('electron-updater');

// URL base de Forge en HTTPS. @xmcl/installer usa por defecto
// "http://files.minecraftforge.net/maven" (nótese el http://); ese host
// redirige (301) a https, y la versión de undici que trae la librería no
// sigue esa redirección aunque se le pida, así que hay que forzar https
// explícitamente en todas las llamadas (tanto para listar versiones como
// para descargar el instalador).
const FORGE_MAVEN_HTTPS = 'https://files.minecraftforge.net/maven';

// msmc se carga de forma "segura": si el usuario todavía no ha hecho
// `npm install`, no queremos que la app entera crashee al arrancar,
// solo que el login con Microsoft avise del problema.
let Auth = null;
try {
    ({ Auth } = require('msmc'));
} catch (err) {
    console.warn('[WARN] msmc no está instalado. Ejecuta "npm install" para poder usar el login con Microsoft.');
}

let mainWindow;
let gameProcess = null;
let pendingDeepLink = null;

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const INSTANCES_DIR = path.join(app.getPath('appData'), '.milauncher', 'instances');
const VANILLA_ROOT = path.join(app.getPath('appData'), '.milauncher');

function loadConfig() {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        return {};
    }
}

function saveConfig(partial) {
    try {
        const current = loadConfig();
        const merged = { ...current, ...partial };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
        return merged;
    } catch (err) {
        console.error('[ERROR] No se pudo guardar la config:', err);
        return loadConfig();
    }
}

// ============================================================================
// DETECCIÓN AUTOMÁTICA DE JAVA (igual que antes)
// ============================================================================

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

function findJavaCandidates() {
    const candidates = [];
    const candidateBaseDirs = [];

    if (process.platform === 'win32') {
        candidateBaseDirs.push(
            'C:\\Program Files\\Java',
            'C:\\Program Files (x86)\\Java',
            'C:\\Program Files\\Eclipse Adoptium',
            'C:\\Program Files\\Microsoft\\jdk',
            'C:\\Program Files\\Zulu',
            'C:\\Program Files\\Amazon Corretto'
        );
    } else if (process.platform === 'darwin') {
        candidateBaseDirs.push('/Library/Java/JavaVirtualMachines');
    } else {
        candidateBaseDirs.push('/usr/lib/jvm');
    }

    for (const baseDir of candidateBaseDirs) {
        if (!fs.existsSync(baseDir)) continue;

        let entries;
        try {
            entries = fs.readdirSync(baseDir, { withFileTypes: true });
        } catch (err) {
            continue;
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const dirName = entry.name;
            let javaExe;
            if (process.platform === 'win32') {
                javaExe = path.join(baseDir, dirName, 'bin', 'java.exe');
            } else if (process.platform === 'darwin') {
                javaExe = path.join(baseDir, dirName, 'Contents', 'Home', 'bin', 'java');
            } else {
                javaExe = path.join(baseDir, dirName, 'bin', 'java');
            }

            if (fs.existsSync(javaExe)) {
                candidates.push({ path: javaExe, version: parseVersionFromDirName(dirName) });
            }
        }
    }

    if (process.env.JAVA_HOME) {
        const exe = process.platform === 'win32'
            ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe')
            : path.join(process.env.JAVA_HOME, 'bin', 'java');
        if (fs.existsSync(exe)) {
            candidates.push({ path: exe, version: parseVersionFromDirName(path.basename(process.env.JAVA_HOME)) });
        }
    }

    if (process.platform === 'win32' && process.env.APPDATA) {
        const mcRuntimeDir = path.join(process.env.APPDATA, '.minecraft', 'runtime');
        if (fs.existsSync(mcRuntimeDir)) {
            try {
                const components = fs.readdirSync(mcRuntimeDir, { withFileTypes: true }).filter(d => d.isDirectory());
                for (const comp of components) {
                    const possible = path.join(mcRuntimeDir, comp.name, 'windows-x64', comp.name, 'bin', 'java.exe');
                    if (fs.existsSync(possible)) {
                        candidates.push({ path: possible, version: parseVersionFromDirName(comp.name) });
                    }
                }
            } catch (err) {
                // ignoramos si la estructura no coincide
            }
        }
    }

    return candidates;
}

function findNewestJava() {
    const candidates = findJavaCandidates();
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => compareVersionArrays(b.version, a.version));
    return candidates[0].path;
}

// ============================================================================
// ÚLTIMA VERSIÓN DE MINECRAFT (igual que antes, para el modo "sin modpack")
// ============================================================================

let cachedLatestVersion = null;

async function fetchLatestMinecraftVersion() {
    const response = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    if (!response.ok) {
        throw new Error(`Mojang respondió con estado ${response.status}`);
    }
    const data = await response.json();
    if (!data || !data.latest || !data.latest.release) {
        throw new Error('La respuesta de Mojang no tiene el formato esperado.');
    }
    cachedLatestVersion = data.latest.release;
    return cachedLatestVersion;
}

async function getMinecraftVersionToLaunch() {
    try {
        return await fetchLatestMinecraftVersion();
    } catch (err) {
        console.warn('[WARN] No se pudo consultar la última versión de Minecraft:', err.message);
        return cachedLatestVersion || '1.20.1';
    }
}

let cachedReleaseVersions = null;

// Todas las versiones "release" de Minecraft, de más reciente a más antigua,
// sin snapshots ni versiones beta/alpha. Se usa para poblar el <select> de
// versión al crear un modpack.
async function fetchReleaseVersions() {
    const response = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    if (!response.ok) {
        throw new Error(`Mojang respondió con estado ${response.status}`);
    }
    const data = await response.json();
    cachedReleaseVersions = (data.versions || [])
        .filter((v) => v.type === 'release')
        .map((v) => v.id);
    return cachedReleaseVersions;
}

async function getReleaseVersionsToShow() {
    try {
        return await fetchReleaseVersions();
    } catch (err) {
        console.warn('[WARN] No se pudo consultar la lista de versiones de Minecraft:', err.message);
        return cachedReleaseVersions || [];
    }
}

// ============================================================================
// INSTALACIÓN DE FORGE / FABRIC (@xmcl/installer)
// ============================================================================

// Todas las builds de Forge publicadas para una versión de Minecraft, de más
// reciente a más antigua, marcando cuál es la "recommended"/"latest" oficial
// (según promotions_slim.json) para poder preseleccionarla en la UI.
//
// Usamos maven-metadata.xml (XML plano, servido en https) en vez de
// getForgeVersionList() de @xmcl/installer, que scrapea la página HTML de
// Forge en http:// y rompe con "Corrupted Forge Web Page" cuando el servidor
// redirige a https (ver nota de FORGE_MAVEN_HTTPS arriba).
async function getForgeVersionsForMc(mcVersion) {
    const [metaRes, promoRes] = await Promise.all([
        fetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml'),
        fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')
    ]);
    if (!metaRes.ok) throw new Error(`No se pudo consultar las versiones de Forge (estado ${metaRes.status}).`);

    const xml = await metaRes.text();
    const prefix = `${mcVersion}-`;
    const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)]
        .map((m) => m[1])
        .filter((v) => v.startsWith(prefix))
        .map((v) => v.slice(prefix.length));
    const unique = [...new Set(versions)];
    unique.sort((a, b) => compareVersionArrays(parseVersionFromDirName(b), parseVersionFromDirName(a)));

    let recommended = null;
    let latest = null;
    if (promoRes.ok) {
        const promos = (await promoRes.json()).promos || {};
        recommended = promos[`${mcVersion}-recommended`] || null;
        latest = promos[`${mcVersion}-latest`] || null;
    }

    return unique.map((version) => ({
        version,
        recommended: version === recommended,
        latest: version === latest
    }));
}

async function resolveForgeVersion(mcVersion) {
    const list = await getForgeVersionsForMc(mcVersion);
    const pick = list.find((v) => v.recommended) || list.find((v) => v.latest) || list[0];
    if (!pick) throw new Error(`No hay ninguna versión de Forge disponible para Minecraft ${mcVersion}.`);
    return pick.version;
}

// Todas las builds de Fabric Loader para una versión de Minecraft, marcando
// cuál es la estable más reciente (la que se preselecciona por defecto).
async function getFabricVersionsForMc(mcVersion) {
    const artifacts = await getLoaderArtifactListFor(mcVersion);
    const recommendedIndex = artifacts.findIndex((a) => a.loader.stable);
    return artifacts.map((a, i) => ({
        version: a.loader.version,
        stable: a.loader.stable,
        recommended: i === (recommendedIndex === -1 ? 0 : recommendedIndex)
    }));
}

async function resolveFabricLoaderVersion(mcVersion) {
    const list = await getFabricVersionsForMc(mcVersion);
    const pick = list.find((v) => v.recommended) || list[0];
    if (!pick) throw new Error(`No hay ninguna versión de Fabric Loader disponible para Minecraft ${mcVersion}.`);
    return pick.version;
}

// Instala Forge o Fabric dentro de la carpeta de la instancia del modpack y
// devuelve el "version id" instalado, que es lo que hay que pasar como
// version.custom a minecraft-launcher-core para lanzar el juego con ese
// loader. No hace nada (devuelve null) si el modpack es vanilla.
//
// requestedLoaderVersion es la build concreta que eligió el creador del
// modpack (p.ej. "47.4.10" o "0.19.3"). Si viene vacía (modpacks antiguos,
// creados antes de poder elegir versión), se resuelve automáticamente la
// recomendada.
async function installLoaderForInstance(modpackId, mcVersion, loader, requestedLoaderVersion) {
    if (loader !== 'forge' && loader !== 'fabric') return null;

    const root = instanceDir(modpackId);
    fs.mkdirSync(root, { recursive: true });

    const cfg = loadConfig();
    const javaPath = (cfg.javaPath && cfg.javaPath.trim()) || findNewestJava();

    // El instalador de Forge necesita que el .jar vanilla de esa versión ya
    // esté en disco (lo usa para post-procesarlo con "jarsplitter"), así que
    // instalamos primero la versión vanilla base antes de instalar el loader.
    const versionList = await getVersionList();
    const versionMeta = versionList.versions.find((v) => v.id === mcVersion);
    if (!versionMeta) throw new Error(`Minecraft ${mcVersion} no aparece en la lista de versiones de Mojang.`);
    await installVersion(versionMeta, root);

    let versionId;
    if (loader === 'forge') {
        const forgeVersion = requestedLoaderVersion || await resolveForgeVersion(mcVersion);
        versionId = await installForge(
            { mcversion: mcVersion, version: forgeVersion },
            root,
            { mavenHost: FORGE_MAVEN_HTTPS, ...(javaPath ? { java: javaPath } : {}) }
        );
    } else {
        const fabricVersion = requestedLoaderVersion || await resolveFabricLoaderVersion(mcVersion);
        versionId = await installFabric({ minecraftVersion: mcVersion, version: fabricVersion, minecraft: root });
    }

    // Descargar las ~2000 librerías/assets en paralelo es propenso a fallos
    // puntuales de red (conexiones que se cortan bajo mucha concurrencia).
    // Los archivos ya descargados y válidos se saltan en cada intento, así
    // que reintentar es barato y evita que un simple parpadeo de red rompa
    // toda la sincronización.
    const resolved = await Version.parse(root, versionId);
    const MAX_ATTEMPTS = 5;
    let lastErr;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await installDependencies(resolved, { assetsDownloadConcurrency: 12, librariesDownloadConcurrency: 12 });
            lastErr = null;
            break;
        } catch (err) {
            lastErr = err;
            console.warn(`[WARN] Fallo al instalar dependencias de ${loader} (intento ${attempt}/${MAX_ATTEMPTS}):`, err.message || err);
            if (attempt < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 1500));
        }
    }
    if (lastErr) throw lastErr;

    return versionId;
}

// ============================================================================
// MODRINTH (búsqueda y resolución de mods/resource packs)
// ============================================================================

const MODRINTH_USER_AGENT = 'EmberLauncher/1.0 (github.com/HCuadrado428/Launcher)';

// projectType: 'mod' | 'resourcepack' (coincide con el project_type de Modrinth).
async function searchModrinth(query, mcVersion, loader, projectType) {
    const facets = [[`project_type:${projectType}`]];
    if (mcVersion) facets.push([`versions:${mcVersion}`]);
    if (projectType === 'mod' && loader && loader !== 'vanilla') facets.push([`categories:${loader}`]);

    const params = new URLSearchParams({
        query: query || '',
        facets: JSON.stringify(facets),
        limit: '20'
    });

    const res = await fetch(`https://api.modrinth.com/v2/search?${params.toString()}`, {
        headers: { 'User-Agent': MODRINTH_USER_AGENT }
    });
    if (!res.ok) throw new Error(`Modrinth respondió con estado ${res.status} al buscar.`);
    const data = await res.json();
    return data.hits;
}

// Devuelve la versión más reciente compatible con la versión de Minecraft y
// el loader del modpack, o null si no hay ninguna.
async function resolveBestModrinthVersion(projectId, mcVersion, loader, projectType) {
    const params = new URLSearchParams();
    if (mcVersion) params.set('game_versions', JSON.stringify([mcVersion]));
    if (projectType === 'mod' && loader && loader !== 'vanilla') params.set('loaders', JSON.stringify([loader]));

    const res = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version?${params.toString()}`, {
        headers: { 'User-Agent': MODRINTH_USER_AGENT }
    });
    if (!res.ok) throw new Error(`Modrinth respondió con estado ${res.status} al consultar versiones.`);
    const versions = await res.json();
    return versions[0] || null;
}

// ============================================================================
// CLIENTE DE LA API DEL SERVIDOR DE MODPACKS
// ============================================================================

function getBackendUrl() {
    const cfg = loadConfig();
    return (cfg.backendUrl || 'https://serverminecraft-production.up.railway.app/').replace(/\/+$/, '');
}

// Hace una petición autenticada al backend. Lanza un error legible si algo
// falla, para que el renderer pueda mostrarlo directamente en un toast.
async function apiRequest(pathname, { method = 'GET', body, isForm = false } = {}) {
    const cfg = loadConfig();
    if (!cfg.session || !cfg.session.token) {
        throw new Error('Necesitas iniciar sesión con una cuenta de Microsoft para usar los modpacks.');
    }

    const headers = { Authorization: `Bearer ${cfg.session.token}` };
    let payload = body;
    if (body && !isForm) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }

    const res = await fetch(`${getBackendUrl()}${pathname}`, { method, headers, body: payload });
    let data = null;
    try { data = await res.json(); } catch (err) { /* respuesta sin cuerpo JSON */ }

    if (!res.ok) {
        const err = new Error((data && data.error) || `El servidor respondió con estado ${res.status}.`);
        err.status = res.status;
        throw err;
    }
    return data;
}

// Verifica el access_token de Microsoft contra nuestro backend y guarda la
// sesión (JWT) resultante en la config local.
async function verifySessionWithBackend(accessToken) {
    const res = await fetch(`${getBackendUrl()}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo verificar la sesión con el servidor de modpacks.');
    saveConfig({ session: { token: data.token, uuid: data.uuid, username: data.username } });
    return data;
}

// ============================================================================
// INSTANCIAS DE MODPACKS EN DISCO
// ============================================================================

function instanceDir(modpackId) {
    return path.join(INSTANCES_DIR, modpackId);
}
function instanceModsDir(modpackId) {
    return path.join(instanceDir(modpackId), 'mods');
}
function instanceResourcePacksDir(modpackId) {
    return path.join(instanceDir(modpackId), 'resourcepacks');
}
function instanceDirForModType(modpackId, mod) {
    return mod.type === 'resourcepack' ? instanceResourcePacksDir(modpackId) : instanceModsDir(modpackId);
}
function instanceMetaPath(modpackId) {
    return path.join(instanceDir(modpackId), '.launcher-meta.json');
}

function loadInstanceMeta(modpackId) {
    try {
        return JSON.parse(fs.readFileSync(instanceMetaPath(modpackId), 'utf-8'));
    } catch (err) {
        return { version_hash: null, mods: [] };
    }
}
function saveInstanceMeta(modpackId, meta) {
    fs.mkdirSync(instanceDir(modpackId), { recursive: true });
    fs.writeFileSync(instanceMetaPath(modpackId), JSON.stringify(meta, null, 2));
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

async function downloadModFile(modpackId, mod, destPath) {
    // Los mods con source 'modrinth' (u otras fuentes externas en el futuro)
    // se descargan directamente del CDN de origen; los subidos a mano pasan
    // por nuestro propio backend, como siempre.
    if (mod.source && mod.source !== 'upload' && mod.download_url) {
        const res = await fetch(mod.download_url);
        if (!res.ok) throw new Error(`No se pudo descargar ${mod.filename} desde ${mod.source} (estado ${res.status}).`);
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(destPath, buffer);
        return;
    }

    const cfg = loadConfig();
    const res = await fetch(`${getBackendUrl()}/api/modpacks/${modpackId}/mods/${mod.id}/download`, {
        headers: { Authorization: `Bearer ${cfg.session.token}` }
    });
    if (!res.ok) throw new Error(`No se pudo descargar ${mod.filename} (estado ${res.status}).`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
}

// Compara el manifiesto del servidor con lo que hay en disco y descarga /
// borra lo que haga falta. Emite progreso a la ventana mientras trabaja.
async function syncModpack(modpackId) {
    const manifest = await apiRequest(`/api/modpacks/${modpackId}/manifest`);
    const localMeta = loadInstanceMeta(modpackId);
    fs.mkdirSync(instanceModsDir(modpackId), { recursive: true });
    fs.mkdirSync(instanceResourcePacksDir(modpackId), { recursive: true });

    // Los mods antiguos sincronizados antes de que existiera "type" no lo
    // tienen guardado en el meta local; se asumen mods normales.
    const remoteMods = manifest.mods.map(m => ({ type: 'mod', ...m })); // [{id, filename, filesize, sha1, type}]
    const localMods = (localMeta.mods || []).map(m => ({ type: 'mod', ...m }));

    const remoteById = new Map(remoteMods.map(m => [m.id, m]));
    const localById = new Map(localMods.map(m => [m.id, m]));

    const toDelete = localMods.filter(m => !remoteById.has(m.id));
    const toDownload = remoteMods.filter(m => {
        const local = localById.get(m.id);
        return !local || local.sha1 !== m.sha1;
    });

    const totalSteps = toDelete.length + toDownload.length;
    let doneSteps = 0;

    const sendProgress = (label) => {
        doneSteps++;
        const percent = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 100;
        if (mainWindow) {
            mainWindow.webContents.send('modpack-sync-progress', { label, percent, modpackId });
        }
    };

    for (const mod of toDelete) {
        const filePath = path.join(instanceDirForModType(modpackId, mod), mod.filename);
        try { fs.unlinkSync(filePath); } catch (err) { /* ya no estaba */ }
        sendProgress(`Quitando ${mod.filename}...`);
    }

    for (const mod of toDownload) {
        const destPath = path.join(instanceDirForModType(modpackId, mod), mod.filename);
        await downloadModFile(modpackId, mod, destPath);
        const actualSha1 = await sha1File(destPath);
        if (actualSha1 !== mod.sha1) {
            throw new Error(`El archivo ${mod.filename} se descargó pero no coincide con el original (posible corrupción). Vuelve a intentarlo.`);
        }
        sendProgress(`Descargando ${mod.filename}...`);
    }

    // Instalamos Forge/Fabric si hace falta. Se cachea vía .launcher-meta.json
    // para no reinstalar el loader en cada sincronización si no ha cambiado.
    const loader = manifest.loader || 'vanilla';
    const requestedLoaderVersion = manifest.loader_version || '';
    let loaderVersionId = localMeta.loader_version_id || null;
    const versionJsonPath = loaderVersionId
        ? path.join(instanceDir(modpackId), 'versions', loaderVersionId, `${loaderVersionId}.json`)
        : null;
    const needsLoaderInstall = loader !== 'vanilla' && (
        localMeta.loader !== loader ||
        localMeta.mc_version !== manifest.mc_version ||
        (localMeta.requested_loader_version || '') !== requestedLoaderVersion ||
        !loaderVersionId ||
        !fs.existsSync(versionJsonPath)
    );

    if (needsLoaderInstall) {
        if (mainWindow) mainWindow.webContents.send('modpack-sync-progress', { label: `Instalando ${loader}...`, percent: 0, modpackId });
        loaderVersionId = await installLoaderForInstance(modpackId, manifest.mc_version, loader, requestedLoaderVersion);
        if (mainWindow) mainWindow.webContents.send('modpack-sync-progress', { label: `${loader} instalado`, percent: 100, modpackId });
    } else if (loader === 'vanilla') {
        loaderVersionId = null;
    }

    saveInstanceMeta(modpackId, {
        version_hash: manifest.version_hash,
        mods: remoteMods,
        loader,
        mc_version: manifest.mc_version,
        requested_loader_version: requestedLoaderVersion,
        loader_version_id: loaderVersionId
    });

    return {
        name: manifest.name,
        mc_version: manifest.mc_version,
        loader,
        loader_version: requestedLoaderVersion,
        version_hash: manifest.version_hash,
        loader_version_id: loaderVersionId
    };
}

// ============================================================================
// AUTO-ACTUALIZACIÓN (electron-updater + GitHub Releases)
// ============================================================================

// Comprueba, descarga e instala actualizaciones publicadas como GitHub
// Release del repo configurado en package.json ("build.publish"). Solo tiene
// sentido en la app empaquetada: en desarrollo (electron .) no hay artefacto
// publicado que comprobar y autoUpdater lanzaría un error.
function setupAutoUpdates() {
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    const send = (type, extra) => {
        if (mainWindow) mainWindow.webContents.send('update-status', { type, ...extra });
    };

    autoUpdater.on('update-available', (info) => send('available', { version: info.version }));
    autoUpdater.on('download-progress', (progress) => send('downloading', { percent: Math.round(progress.percent) }));
    autoUpdater.on('update-downloaded', (info) => send('downloaded', { version: info.version }));
    autoUpdater.on('error', (err) => {
        console.warn('[WARN] Error comprobando actualizaciones:', err && err.message ? err.message : err);
    });

    autoUpdater.checkForUpdates().catch((err) => {
        console.warn('[WARN] No se pudo comprobar actualizaciones:', err && err.message ? err.message : err);
    });
}

ipcMain.on('restart-and-update', () => autoUpdater.quitAndInstall());

// ============================================================================
// VENTANA Y DEEP LINKS (milauncher://invite/TOKEN)
// ============================================================================

function handleDeepLink(url) {
    const match = /^milauncher:\/\/invite\/(.+)$/.exec(url || '');
    if (!match) return;
    const token = match[1];
    if (mainWindow && !mainWindow.webContents.isLoading()) {
        mainWindow.webContents.send('invite-received', { token });
        mainWindow.focus();
    } else {
        pendingDeepLink = token;
    }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', (event, argv) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        const url = argv.find(arg => arg.startsWith('milauncher://'));
        if (url) handleDeepLink(url);
    });

    app.on('open-url', (event, url) => {
        event.preventDefault();
        handleDeepLink(url);
    });

    function createWindow() {
        mainWindow = new BrowserWindow({
            width: 900,
            height: 700,
            backgroundColor: '#12181f',
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                nodeIntegration: false,
                contextIsolation: true
            }
        });
        mainWindow.loadFile('index.html');

        mainWindow.webContents.on('did-finish-load', () => {
            if (pendingDeepLink) {
                mainWindow.webContents.send('invite-received', { token: pendingDeepLink });
                pendingDeepLink = null;
            }
        });
    }

    app.whenReady().then(() => {
        // Registro del protocolo milauncher:// para los links de invitación.
        // En desarrollo (ejecutando "electron .") hace falta pasar la ruta
        // del proyecto; en la app empaquetada no.
        if (process.defaultApp) {
            if (process.argv.length >= 2) {
                app.setAsDefaultProtocolClient('milauncher', process.execPath, [path.resolve(process.argv[1])]);
            }
        } else {
            app.setAsDefaultProtocolClient('milauncher');
        }

        createWindow();
        setupAutoUpdates();

        // En Windows/Linux, si la app se abrió directamente desde un link,
        // el link viene como argumento en process.argv.
        const initialUrl = process.argv.find(arg => arg.startsWith('milauncher://'));
        if (initialUrl) handleDeepLink(initialUrl);
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}

// ============================================================================
// EVENTOS DEL LANZADOR DE MINECRAFT
// ============================================================================

launcher.on('debug', (e) => console.log(`[DEBUG] ${e}`));
launcher.on('data', (e) => console.log(`[GAME] ${e}`));

launcher.on('progress', (e) => {
    if (mainWindow) mainWindow.webContents.send('game-progress', e);
});
launcher.on('download-status', (e) => {
    if (mainWindow) mainWindow.webContents.send('game-progress', e);
});

launcher.on('close', (code) => {
    console.log(`[CLOSE] El juego se cerró con código ${code}`);
    gameProcess = null;
    if (mainWindow) {
        mainWindow.webContents.send('game-status', { type: 'closed', code });
    }
});

// ============================================================================
// IPC: CONFIG / CUENTAS
// ============================================================================

ipcMain.handle('get-config', () => loadConfig());

ipcMain.handle('get-backend-url', () => getBackendUrl());
ipcMain.handle('set-backend-url', (event, url) => saveConfig({ backendUrl: url }));

ipcMain.handle('login-offline', (event, username) => {
    const account = { type: 'offline', username: username || 'Jugador' };
    // Las cuentas offline no pueden usar el sistema de modpacks (necesitamos
    // una identidad verificada de Microsoft para dar acceso por usuario), así
    // que al cambiar a offline limpiamos cualquier sesión de servidor previa.
    saveConfig({ account, session: null, activeModpack: null });
    return account;
});

ipcMain.handle('login-microsoft', async () => {
    if (!Auth) {
        return {
            success: false,
            message: 'Falta instalar la librería "msmc". Ejecuta "npm install" en la carpeta del proyecto y vuelve a intentarlo.'
        };
    }

    try {
        const authManager = new Auth('select_account');
        const xboxManager = await authManager.launch('electron');
        const token = await xboxManager.getMinecraft();
        const mclcAuth = token.mclc();

        const account = {
            type: 'microsoft',
            username: mclcAuth.name,
            uuid: mclcAuth.uuid,
            auth: mclcAuth
        };

        saveConfig({ account });

        // Además de guardar la cuenta para jugar, verificamos la sesión
        // contra el backend de modpacks para poder crear/unirnos a modpacks.
        try {
            await verifySessionWithBackend(mclcAuth.access_token);
        } catch (err) {
            console.warn('[WARN] No se pudo verificar la sesión con el backend de modpacks:', err.message);
            // No bloqueamos el login normal por esto: el usuario puede jugar
            // igualmente, solo no podrá usar modpacks hasta que el backend
            // esté disponible.
        }

        return { success: true, account: { type: 'microsoft', username: account.username, uuid: account.uuid } };
    } catch (err) {
        console.error('[ERROR] Login con Microsoft fallido:', err);
        return {
            success: false,
            message: err && err.message ? err.message : 'No se pudo completar el login con Microsoft.'
        };
    }
});

ipcMain.handle('logout', () => {
    const cfg = loadConfig();
    delete cfg.account;
    cfg.session = null;
    cfg.activeModpack = null;
    saveConfig(cfg);
    return true;
});

ipcMain.handle('select-java-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecciona java.exe',
        properties: ['openFile'],
        filters: [{ name: 'Java', extensions: ['exe'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

ipcMain.handle('auto-detect-java', () => findNewestJava());

ipcMain.handle('get-latest-mc-version', () => getMinecraftVersionToLaunch());
ipcMain.handle('get-release-versions', () => getReleaseVersionsToShow());

ipcMain.handle('set-language', (event, lang) => saveConfig({ language: lang }));

// ============================================================================
// IPC: LISTAS DE VERSIONES DE LOADER (para el selector al crear un modpack)
// ============================================================================

ipcMain.handle('get-forge-versions', (event, { mcVersion }) => getForgeVersionsForMc(mcVersion));
ipcMain.handle('get-fabric-versions', (event, { mcVersion }) => getFabricVersionsForMc(mcVersion));

// ============================================================================
// IPC: MODPACKS
// ============================================================================

ipcMain.handle('modpacks-create', async (event, { name, mcVersion, loader, loaderVersion }) => {
    return apiRequest('/api/modpacks', {
        method: 'POST',
        body: { name, mc_version: mcVersion, loader, loader_version: loaderVersion }
    });
});

ipcMain.handle('modpacks-delete', async (event, { id }) => {
    return apiRequest(`/api/modpacks/${id}`, { method: 'DELETE' });
});

ipcMain.handle('modpacks-mine', async () => {
    return apiRequest('/api/modpacks/mine');
});

ipcMain.handle('modpacks-manifest', async (event, { id }) => {
    return apiRequest(`/api/modpacks/${id}/manifest`);
});

ipcMain.handle('modpacks-add-mod', async (event, { id, type }) => {
    const modType = type === 'resourcepack' ? 'resourcepack' : 'mod';
    const result = await dialog.showOpenDialog(mainWindow, {
        title: modType === 'resourcepack' ? 'Selecciona uno o varios resource packs (.zip)' : 'Selecciona uno o varios mods (.jar)',
        properties: ['openFile', 'multiSelections'],
        filters: [{
            name: modType === 'resourcepack' ? 'Resource packs de Minecraft' : 'Mods de Minecraft',
            extensions: [modType === 'resourcepack' ? 'zip' : 'jar']
        }]
    });
    if (result.canceled || result.filePaths.length === 0) return { cancelled: true };

    const cfg = loadConfig();
    const uploaded = [];
    for (const filePath of result.filePaths) {
        const fileBuffer = fs.readFileSync(filePath);
        const form = new FormData();
        // "type" tiene que ir antes que "mod": multer procesa el multipart en
        // orden y solo ve los campos ya leídos cuando decide si el archivo
        // pasa el filtro de extensión.
        form.append('type', modType);
        form.append('mod', new Blob([fileBuffer]), path.basename(filePath));

        const res = await fetch(`${getBackendUrl()}/api/modpacks/${id}/mods`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cfg.session.token}` },
            body: form
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `No se pudo subir ${path.basename(filePath)}.`);
        uploaded.push(data);
    }
    return { cancelled: false, uploaded };
});

ipcMain.handle('modpacks-remove-mod', async (event, { id, modId }) => {
    return apiRequest(`/api/modpacks/${id}/mods/${modId}`, { method: 'DELETE' });
});

ipcMain.handle('search-modrinth', async (event, { query, mcVersion, loader, projectType }) => {
    return searchModrinth(query, mcVersion, loader, projectType);
});

ipcMain.handle('add-mod-from-modrinth', async (event, { id, projectId, mcVersion, loader, projectType }) => {
    const version = await resolveBestModrinthVersion(projectId, mcVersion, loader, projectType);
    if (!version) throw new Error('No hay ninguna versión de este mod compatible con la versión de Minecraft/loader del modpack.');
    return apiRequest(`/api/modpacks/${id}/mods/from-modrinth`, {
        method: 'POST',
        body: { project_id: projectId, version_id: version.id, type: projectType }
    });
});

ipcMain.handle('modpacks-create-invite', async (event, { id, maxUses, expiresHours }) => {
    return apiRequest(`/api/modpacks/${id}/invite`, {
        method: 'POST',
        body: { max_uses: maxUses || null, expires_in_hours: expiresHours || null }
    });
});

ipcMain.handle('modpacks-redeem-invite', async (event, { token }) => {
    return apiRequest(`/api/invites/${token}/redeem`, { method: 'POST' });
});

ipcMain.handle('modpacks-sync', async (event, { id }) => {
    return syncModpack(id);
});

ipcMain.handle('modpacks-select', async (event, { id, name, mcVersion, loader, loaderVersion }) => {
    saveConfig({
        activeModpack: id
            ? { id, name, mc_version: mcVersion, loader: loader || 'vanilla', loader_version: loaderVersion || '' }
            : null
    });
    return true;
});

// ============================================================================
// IPC: LANZAR / DETENER EL JUEGO
// ============================================================================

ipcMain.on('launch-game', async (event, { javaPath, memory }) => {
    const cfg = loadConfig();
    const account = cfg.account;

    if (!account) {
        mainWindow.webContents.send('game-status', {
            type: 'error',
            message: 'No hay ninguna cuenta seleccionada. Inicia sesión primero.'
        });
        return;
    }

    let finalJavaPath = javaPath && javaPath.trim() ? javaPath.trim() : findNewestJava();
    if (!finalJavaPath) {
        mainWindow.webContents.send('game-status', {
            type: 'error',
            message: 'No se encontró ninguna instalación de Java en este sistema. Instala Java o indica la ruta manualmente.'
        });
        return;
    }

    saveConfig({ javaPath: finalJavaPath, memory });

    const authorization = account.type === 'microsoft'
        ? account.auth
        : Authenticator.getAuth(account.username);

    const activeModpack = cfg.activeModpack;
    let versionNumber;
    let root;
    let loaderVersionId = null;

    if (activeModpack) {
        // Jugando con un modpack: sincronizamos siempre antes de lanzar (esto
        // descarga/borra mods, instala Forge/Fabric si hace falta, y de paso
        // detecta si el modpack fue eliminado por el creador).
        let synced;
        try {
            synced = await syncModpack(activeModpack.id);
        } catch (err) {
            if (err.status === 404 || err.status === 403) {
                try { fs.rmSync(instanceDir(activeModpack.id), { recursive: true, force: true }); } catch (e) { /* ignorar */ }
                saveConfig({ activeModpack: null });
                mainWindow.webContents.send('game-status', {
                    type: 'modpack-removed',
                    message: `El modpack "${activeModpack.name}" ya no está disponible (fue eliminado o perdiste el acceso). Has vuelto a Minecraft vanilla; pulsa "Iniciar Juego" de nuevo si quieres continuar.`
                });
                return;
            }
            mainWindow.webContents.send('game-status', {
                type: 'error',
                message: `No se pudo sincronizar el modpack: ${err.message}`
            });
            return;
        }

        versionNumber = synced.mc_version;
        loaderVersionId = synced.loader_version_id;
        root = instanceDir(activeModpack.id);
        mainWindow.webContents.send('game-status', { type: 'version-selected', version: versionNumber });
    } else {
        versionNumber = await getMinecraftVersionToLaunch();
        root = VANILLA_ROOT;
        mainWindow.webContents.send('game-status', { type: 'version-selected', version: versionNumber });
    }

    let opts = {
        clientPackage: null,
        authorization,
        root,
        javaPath: finalJavaPath,
        skipVersionCheck: true,
        version: loaderVersionId
            ? { number: versionNumber, type: 'release', custom: loaderVersionId }
            : { number: versionNumber, type: 'release' },
        memory: {
            max: (memory && memory.max) || '4G',
            min: (memory && memory.min) || '2G'
        }
    };

    try {
        gameProcess = await launcher.launch(opts);
        mainWindow.webContents.send('game-status', { type: 'launched' });
    } catch (err) {
        console.error('[ERROR] Fallo al lanzar el juego:', err);
        gameProcess = null;
        mainWindow.webContents.send('game-status', {
            type: 'error',
            message: err && err.message ? err.message : String(err)
        });
    }
});

ipcMain.on('stop-game', () => {
    if (gameProcess) {
        console.log('[STOP] Deteniendo el juego...');
        gameProcess.kill();
        gameProcess = null;
        mainWindow.webContents.send('game-status', { type: 'stopped' });
    }
});
