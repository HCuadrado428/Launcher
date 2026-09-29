const fs = require('fs');
const os = require('os');
const path = require('path');
const { INSTANCES_DIR, instanceDir, instanceModsDir, instanceResourcePacksDir, instanceModFilePath, instanceMetaPath } = require('./paths');
const { runWithConcurrencyLimit, sha1File, formatBytesMain, getFreeDiskSpaceBytes } = require('./utils');
const { fetchWithTimeout, downloadToFile, apiPath } = require('./httpUtils');
const { loadConfig } = require('./config');
const { getBackendUrl, apiRequest, requireSessionToken } = require('./backend');
const { installLoaderForInstance } = require('./loaders');
const { ensureSharedGameFilesLinked } = require('./sharedGameFiles');
const { extractSharedConfigZip } = require('./sharedConfig');
const { createKeyedLock, createSingleFlight } = require('./instanceLock');
const { computeSyncPlan } = require('./syncPlan');
const { resolveJavaForVersion } = require('./javaRuntime');
const { getTargetSettings } = require('./targetSettings');
const { sendToWindow } = require('./windowState');
const { tm } = require('./i18nMain');

// ============================================================================
// INSTANCIAS DE MODPACKS EN DISCO: sincronizar, reparar, verificar
// ============================================================================

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

function sendSyncProgress(modpackId, label, percent) {
    sendToWindow('modpack-sync-progress', { label, percent, modpackId });
}

// Descarga un mod a destPath y comprueba su sha1 contra el del manifiesto.
// Pasa por un archivo .part que solo se renombra al nombre final si todo ha
// ido bien (ver downloadToFile), así que nunca se queda un mod a medias o
// corrupto con el nombre bueno, y no hace falta cargarlo entero en memoria.
async function downloadModFile(modpackId, mod, destPath) {
    // Los mods con source 'modrinth' (u otras fuentes externas en el futuro)
    // se descargan directamente del CDN de origen; los subidos a mano pasan
    // por nuestro propio backend, como siempre.
    const fromExternalSource = Boolean(mod.source && mod.source !== 'upload' && mod.download_url);
    let url;
    let headers = {};
    if (fromExternalSource) {
        if (!/^https:\/\//i.test(mod.download_url)) {
            throw new Error(tm('sys.downloadNotHttps', { file: mod.filename }));
        }
        url = mod.download_url;
    } else {
        url = `${getBackendUrl()}${apiPath`/api/modpacks/${modpackId}/mods/${mod.id}/download`}`;
        headers = { Authorization: `Bearer ${requireSessionToken()}` };
    }

    try {
        await downloadToFile(url, destPath, { headers, expectedSha1: mod.sha1 });
    } catch (err) {
        if (err.code === 'SHA1_MISMATCH') {
            throw new Error(tm('sys.downloadCorrupt', { file: mod.filename }), { cause: err });
        }
        if (err.status) {
            const message = fromExternalSource
                ? tm('sys.downloadFailedFrom', { file: mod.filename, source: mod.source, status: err.status })
                : tm('sys.downloadFailed', { file: mod.filename, status: err.status });
            throw new Error(message, { cause: err });
        }
        throw err;
    }
}

// Sincronizar puede llegar a descargar miles de archivos pequeños en
// paralelo (librerías/assets de Minecraft), y con un antivirus escaneando
// cada archivo nuevo al vuelo eso satura el disco y la CPU del sistema
// entero, no solo del launcher ("todo el ordenador va lento"). Bajarle la
// prioridad al proceso mientras dura la sincronización no reduce el trabajo
// en sí, pero le dice a Windows que priorice cualquier otra cosa que el
// usuario esté haciendo mientras tanto. Se lleva la cuenta de cuántas
// sincronizaciones hay en marcha para no devolver la prioridad normal
// mientras quede alguna (de otro modpack) todavía corriendo.
let lowPriorityHolders = 0;
let priorityLowered = false;

async function withLowPriority(task) {
    if (lowPriorityHolders++ === 0) {
        try {
            os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
            priorityLowered = true;
        } catch (err) {
            // Alguna plataforma/permiso no lo soporta; no es crítico, seguimos igual.
        }
    }
    try {
        return await task();
    } finally {
        if (--lowPriorityHolders === 0 && priorityLowered) {
            priorityLowered = false;
            try { os.setPriority(process.pid, os.constants.priority.PRIORITY_NORMAL); } catch (err) { /* ignorar */ }
        }
    }
}

// Todo lo que modifica los archivos de una instancia (sincronizar, reparar,
// verificar, borrar al abandonar) pasa por runInstanceExclusive para no
// ejecutarse a la vez sobre el mismo modpack. Pedir otra sincronización del
// mismo modpack mientras ya hay una en marcha espera a esa misma en vez de
// lanzar una segunda (joinSync).
const runInstanceExclusive = createKeyedLock();
const joinSync = createSingleFlight();

function syncModpack(modpackId) {
    const key = String(modpackId);
    return joinSync(key, () => runInstanceExclusive(key, () => withLowPriority(() => syncModpackImpl(modpackId))));
}

// Si el dueño ha publicado una config compartida (botón "Compartir mi
// config" → PUT /:id/config), se aplica UNA sola vez por instancia: la
// primera vez que se resuelve, se escribe este marcador y nunca se vuelve a
// tocar, para no pisar ajustes (shaders, keybinds propios, etc.) que el
// jugador cambie después por su cuenta. A propósito NO es .launcher-meta.json
// (que "Reparar instalación" sí borra): si lo fuera, cada reparación
// reaplicaría la config del dueño encima de la del jugador.
function sharedConfigMarkerPath(modpackId) {
    return path.join(instanceDir(modpackId), '.shared-config-applied');
}

// Es best-effort: si falla, no debe tirar abajo la sincronización de
// mods/loader, que es lo importante de verdad.
async function applySharedConfigIfNeeded(modpackId, manifestConfigUpdatedAt) {
    const markerPath = sharedConfigMarkerPath(modpackId);
    if (fs.existsSync(markerPath)) return false;

    let applied = false;
    if (manifestConfigUpdatedAt) {
        try {
            const cfg = loadConfig();
            if (cfg.session && cfg.session.token) {
                const res = await fetchWithTimeout(`${getBackendUrl()}${apiPath`/api/modpacks/${modpackId}/config`}`, {
                    headers: { Authorization: `Bearer ${cfg.session.token}` }
                });
                if (res.ok) {
                    const buffer = Buffer.from(await res.arrayBuffer());
                    // Solo se aceptan config/** y options.txt (ver sharedConfig.js).
                    await extractSharedConfigZip(buffer, instanceDir(modpackId));
                    applied = true;
                } else if (res.status !== 404) {
                    throw new Error(`El servidor respondió con estado ${res.status}.`);
                }
            }
        } catch (err) {
            console.warn('[WARN] No se pudo aplicar la configuración compartida del modpack:', err.message);
        }
    }

    try {
        fs.mkdirSync(instanceDir(modpackId), { recursive: true });
        fs.writeFileSync(markerPath, String(Date.now()));
    } catch (err) { /* no crítico: en el peor caso se reintenta en el siguiente sync */ }
    return applied;
}

// El instalador de Forge/Fabric descarga sus propias librerías y assets
// vanilla (puede rondar varios cientos de MB), así que sumamos un colchón
// aproximado al comprobar espacio libre, además de un margen de seguridad.
const LOADER_INSTALL_BUFFER_BYTES = 700 * 1024 * 1024;
const SAFETY_MARGIN_BYTES = 200 * 1024 * 1024;

async function syncModpackImpl(modpackId) {
    // assets/ y libraries/ son idénticos para cualquier instancia con la
    // misma versión de Minecraft; enlazarlos contra el almacén compartido
    // (en vez de dejar que cada instancia descargue su propia copia) es lo
    // que evita volver a bajar miles de archivos ya descargados por otro
    // modpack o por el modo vanilla. Se hace aquí, antes de instalar el
    // loader, para que @xmcl/installer ya se los encuentre puestos.
    ensureSharedGameFilesLinked(instanceDir(modpackId));

    const manifest = await apiRequest(apiPath`/api/modpacks/${modpackId}/manifest`);
    const localMeta = loadInstanceMeta(modpackId);
    fs.mkdirSync(instanceModsDir(modpackId), { recursive: true });
    fs.mkdirSync(instanceResourcePacksDir(modpackId), { recursive: true });

    // Los mods marcados "optional" en el manifiesto se incluyen salvo que el
    // jugador los haya desmarcado explícitamente (elección local, por
    // modpack+mod; ausencia = incluido).
    const cfg = loadConfig();
    const optionalChoices = (cfg.optionalModChoices && cfg.optionalModChoices[modpackId]) || {};
    const plan = computeSyncPlan({
        manifest,
        localMeta,
        optionalChoices,
        versionJsonExists: (id) => fs.existsSync(path.join(instanceDir(modpackId), 'versions', id, `${id}.json`))
    });
    const { remoteMods, toDelete, toDownload, loader, requestedLoaderVersion, needsLoaderInstall, totalDownloadBytes } = plan;
    let loaderVersionId = plan.loaderVersionId;

    // El nombre de archivo lo decide el servidor; si alguno no es un nombre
    // simple (p.ej. "../../algo"), no se sincroniza nada en vez de escribir
    // fuera de la carpeta de la instancia.
    for (const mod of toDownload) instanceModFilePath(modpackId, mod);

    if (totalDownloadBytes > 0) {
        sendToWindow('modpack-download-estimate', { modpackId, totalBytes: totalDownloadBytes, fileCount: toDownload.length });
    }

    const requiredBytes = totalDownloadBytes + (needsLoaderInstall ? LOADER_INSTALL_BUFFER_BYTES : 0) + SAFETY_MARGIN_BYTES;
    const freeBytes = getFreeDiskSpaceBytes(INSTANCES_DIR);
    if (freeBytes !== null && freeBytes < requiredBytes) {
        throw new Error(tm('sys.notEnoughDisk', { required: formatBytesMain(requiredBytes), free: formatBytesMain(freeBytes) }));
    }

    const totalSteps = toDelete.length + toDownload.length;
    let doneSteps = 0;
    const stepDone = (label) => {
        doneSteps++;
        sendSyncProgress(modpackId, label, totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 100);
    };

    for (const mod of toDelete) {
        try {
            fs.unlinkSync(instanceModFilePath(modpackId, mod));
        } catch (err) {
            // Ya no estaba, o el nombre guardado no es válido (meta de una
            // versión anterior del launcher): en ambos casos no hay nada que borrar.
        }
        stepDone(tm('sys.progress.removing', { file: mod.filename }));
    }

    // Varios a la vez (límite moderado, no sin límite como las librerías de
    // Minecraft) para aprovechar la conexión sin saturar el sistema.
    await runWithConcurrencyLimit(toDownload, 4, async (mod) => {
        await downloadModFile(modpackId, mod, instanceModFilePath(modpackId, mod));
        stepDone(tm('sys.progress.downloading', { file: mod.filename }));
    });

    // Se cachea vía .launcher-meta.json para no reinstalar el loader en cada
    // sincronización si no ha cambiado.
    if (needsLoaderInstall) {
        sendSyncProgress(modpackId, tm('sys.progress.installingLoader', { loader }), 0);
        // El instalador de Forge ejecuta procesos Java: se usa el mismo Java
        // que usará el juego (el del jugador o el automático de esa versión).
        const java = await resolveJavaForVersion(manifest.mc_version, getTargetSettings(modpackId).javaPath,
            (major, done, total) => sendSyncProgress(modpackId, tm('sys.progress.java', { major }), Math.round((done / total) * 100)));
        loaderVersionId = await installLoaderForInstance(modpackId, manifest.mc_version, loader, requestedLoaderVersion, java.path);
        sendSyncProgress(modpackId, tm('sys.progress.loaderInstalled', { loader }), 100);
    }

    const configApplied = await applySharedConfigIfNeeded(modpackId, manifest.config_updated_at);

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
        loader_version_id: loaderVersionId,
        config_applied: configApplied
    };
}

// "Reparar instalación": borra solo lo que gestiona el launcher (mods,
// resourcepacks del modpack, loader instalado y su meta de sincronización) y
// vuelve a sincronizar desde cero. Deliberadamente NO toca saves/, config/,
// options.txt, screenshots/ ni ningún otro dato del jugador — instanceDir()
// es la misma carpeta que se usa como "root" al lanzar el juego.
const REPAIR_WIPE_SUBPATHS = ['mods', 'resourcepacks', 'versions', 'libraries'];

async function wipeRepairableInstanceData(modpackId) {
    const dir = instanceDir(modpackId);
    for (const sub of REPAIR_WIPE_SUBPATHS) {
        await fs.promises.rm(path.join(dir, sub), { recursive: true, force: true });
    }
    await fs.promises.rm(instanceMetaPath(modpackId), { force: true });
}

function repairModpack(modpackId) {
    return runInstanceExclusive(String(modpackId), async () => {
        await wipeRepairableInstanceData(modpackId);
        return withLowPriority(() => syncModpackImpl(modpackId));
    });
}

// Al abandonar/borrar un modpack no tiene sentido dejar sus mods/librerías
// ocupando disco; se conservan saves/config/screenshots igualmente.
function wipeInstanceAfterLeaving(modpackId) {
    return runInstanceExclusive(String(modpackId), () => wipeRepairableInstanceData(modpackId));
}

// "Verificar archivos": más ligero que "Reparar". No toca el loader ni borra
// nada de entrada; recalcula el sha1 real de cada mod ya descargado (no el
// que se recordó en su día, por si el archivo se corrompió o alguien lo tocó
// a mano) y solo vuelve a descargar los que de verdad no coinciden.
function verifyModpackFiles(modpackId) {
    return runInstanceExclusive(String(modpackId), async () => {
        const mods = loadInstanceMeta(modpackId).mods || [];
        const total = mods.length;
        let checked = 0;
        let fixed = 0;

        await runWithConcurrencyLimit(mods, 6, async (mod) => {
            const filePath = instanceModFilePath(modpackId, mod);
            // Si no existe o no se puede leer, cuenta como "no coincide".
            const actualSha1 = await sha1File(filePath).catch(() => null);

            checked++;
            const percent = total > 0 ? Math.round((checked / total) * 100) : 100;
            if (actualSha1 === mod.sha1) {
                sendSyncProgress(modpackId, tm('sys.progress.checking', { file: mod.filename }), percent);
                return;
            }
            sendSyncProgress(modpackId, tm('sys.progress.fixing', { file: mod.filename }), percent);
            // downloadModFile ya comprueba el sha1 antes de dejar el archivo.
            await downloadModFile(modpackId, mod, filePath);
            fixed++;
        });

        return { checked, fixed };
    });
}

// Comprobación rápida y solo local (sin tocar el servidor) de si la
// instalación de un modpack parece rota: ¿existen de verdad en disco los
// archivos que nuestra propia meta dice que deberían estar? No comprueba el
// contenido (para eso está "Verificar archivos", más lento a propósito): es
// solo la señal barata que decide si tiene sentido ofrecer "Reparar
// instalación". Asíncrona y con varios mods a la vez para no bloquear el
// proceso principal, y en cuanto falta uno se deja de comprobar el resto.
async function checkLocalInstanceHealth(modpackId) {
    const dir = instanceDir(modpackId);
    if (!fs.existsSync(dir)) return { synced: false, healthy: true };

    const meta = loadInstanceMeta(modpackId);

    if (meta.loader && meta.loader !== 'vanilla') {
        if (!meta.loader_version_id) return { synced: true, healthy: false };
        const versionJsonPath = path.join(dir, 'versions', meta.loader_version_id, `${meta.loader_version_id}.json`);
        if (!fs.existsSync(versionJsonPath)) return { synced: true, healthy: false };
    }

    let missing = false;
    await runWithConcurrencyLimit(meta.mods || [], 8, async (mod) => {
        if (missing) return;
        try {
            await fs.promises.access(instanceModFilePath(modpackId, mod), fs.constants.F_OK);
        } catch (err) {
            missing = true;
        }
    });
    return { synced: true, healthy: !missing };
}

module.exports = {
    syncModpack,
    repairModpack,
    verifyModpackFiles,
    wipeInstanceAfterLeaving,
    checkLocalInstanceHealth
};
