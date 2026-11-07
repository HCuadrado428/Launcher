const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { launch, createMinecraftProcessWatcher, Version, LaunchPrecheck, MinecraftFolder } = require('@xmcl/core');
const { installTask } = require('@xmcl/installer');
const { getMojangManifest } = require('./mojang');
const { tm } = require('./i18nMain');

// ============================================================================
// INSTALAR Y LANZAR MINECRAFT (@xmcl/core + @xmcl/installer)
// ============================================================================

// Sustituye a minecraft-launcher-core: @xmcl ya se usaba para instalar Forge
// y Fabric, y así el launcher tiene una sola librería para instalar y lanzar
// (MCLC arrastraba "request", form-data y un adm-zip antiguo, todos con
// vulnerabilidades conocidas).

// --- Credenciales ---

// UUID offline con el mismo algoritmo que usaba minecraft-launcher-core
// (uuid v3 del nombre en el espacio DNS). Los mundos individuales guardan el
// inventario del jugador por UUID: cambiarlo haría que los jugadores offline
// "perdieran" sus cosas en los mundos que ya tenían.
const DNS_NAMESPACE = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex');

function legacyOfflineUuid(username) {
    const hash = crypto.createHash('md5').update(DNS_NAMESPACE).update(String(username), 'utf8').digest();
    hash[6] = (hash[6] & 0x0f) | 0x30;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Normaliza la cuenta a lo que necesita la línea de comandos del juego.
// mcAuth es el objeto mclc que da msmc para cuentas Microsoft.
function gameCredentials(account, mcAuth) {
    if (account.type === 'microsoft' && mcAuth) {
        return {
            name: mcAuth.name,
            uuid: mcAuth.uuid,
            accessToken: mcAuth.access_token,
            userType: 'msa',
            xuid: (mcAuth.meta && mcAuth.meta.xuid) || '0'
        };
    }
    const uuid = legacyOfflineUuid(account.username);
    return { name: account.username, uuid, accessToken: uuid.replace(/-/g, ''), userType: 'legacy', xuid: '0' };
}

// --- Opciones de lanzamiento ---

function memoryToMb(value) {
    const match = /^(\d+)([MG])$/.exec(String(value || ''));
    if (!match) return undefined;
    return Number(match[1]) * (match[2] === 'G' ? 1024 : 1);
}

// Lógica pura (probada en test/): de nuestras opciones a las de @xmcl/core.
function buildLaunchOptions({ root, versionId, javaPath, memory, customArgs, quickPlay, credentials }) {
    const options = {
        gamePath: root,
        version: versionId,
        javaPath,
        minMemory: memoryToMb(memory && memory.min),
        maxMemory: memoryToMb(memory && memory.max),
        gameProfile: { name: credentials.name, id: credentials.uuid },
        accessToken: credentials.accessToken,
        userType: credentials.userType,
        launcherName: 'EmberLauncher',
        // Placeholders de los argumentos del juego en versiones recientes
        // que @xmcl no rellena por su cuenta (${auth_xuid}, ${clientid}):
        // los "features" con objeto se añaden a los valores de sustitución.
        features: { ember_auth: { auth_xuid: credentials.xuid, clientid: credentials.accessToken } },
        // El juego sigue abierto aunque se cierre el launcher, y en Windows
        // no abre una consola aparte (java.exe la abriría).
        extraExecOption: { detached: true, windowsHide: true }
    };
    // Con argumentos propios se usan solo esos: juntarlos con los de por
    // defecto de @xmcl (G1GC...) podía dar dos recolectores de basura a la
    // vez y que Java no arrancara.
    if (Array.isArray(customArgs) && customArgs.length > 0) options.extraJVMArgs = customArgs;
    if (quickPlay) {
        if (quickPlay.type === 'multiplayer') {
            options.quickPlayMultiplayer = quickPlay.identifier;
        } else {
            const [ip, port] = quickPlay.identifier.split(':');
            options.server = { ip, ...(port ? { port: Number(port) } : {}) };
        }
    }
    return options;
}

// --- Instalación de la versión ---

// Marcador que se escribe al terminar de instalar una versión en una
// carpeta raíz, para no volver a comprobar (con hash) miles de archivos en
// cada partida.
function installedMarkerPath(root, versionId) {
    return path.join(root, 'versions', versionId, '.ember-installed');
}

// Instala (si falta) una versión vanilla en root: version.json, .jar,
// librerías y assets. Con las versiones de un loader (Forge/Fabric) no hace
// falta: la sincronización del modpack ya las instaló.
async function ensureVersionInstalled(root, versionId, onProgress) {
    if (fs.existsSync(installedMarkerPath(root, versionId))) {
        try {
            const version = await Version.parse(root, versionId);
            const folder = MinecraftFolder.from(root);
            await LaunchPrecheck.checkVersion(folder, version, {});
            await LaunchPrecheck.checkLibraries(folder, version, {});
            return;
        } catch (err) {
            console.warn(`[WARN] La instalación de ${versionId} está incompleta; se vuelve a comprobar:`, err.message);
        }
    }

    const manifest = await getMojangManifest();
    const versionMeta = (manifest.versions || []).find((v) => v.id === versionId);
    if (!versionMeta) throw new Error(tm('sys.unknownMcVersion', { version: versionId }));

    const task = installTask(versionMeta, root, { assetsDownloadConcurrency: 10, librariesDownloadConcurrency: 10 });
    await task.startAndWait({
        onUpdate: () => {
            if (onProgress && task.total) onProgress(task.progress, task.total);
        }
    });
    fs.writeFileSync(installedMarkerPath(root, versionId), new Date().toISOString());
}

// --- Lanzar ---

// Lanza el juego y espera a que el proceso haya arrancado de verdad. Lanza
// un error (con el motivo) si no se puede: versión incompleta, Java que no
// existe... Devuelve { child, watcher }: watcher emite 'minecraft-exit'
// con { code, signal, crashReport } al cerrarse el juego.
async function startMinecraft(options) {
    const child = await launch(options);
    const watcher = createMinecraftProcessWatcher(child);
    await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        watcher.once('error', reject);
    });
    return { child, watcher };
}

module.exports = { legacyOfflineUuid, gameCredentials, memoryToMb, buildLaunchOptions, ensureVersionInstalled, startMinecraft };
