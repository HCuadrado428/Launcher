const fs = require('fs');
const {
    installForgeTask,
    installFabric,
    getLoaderArtifactListFor,
    installDependenciesTask,
    installVersionTask,
    getVersionList
} = require('@xmcl/installer');
const { Version } = require('@xmcl/core');
const { parseVersionFromDirName, compareVersionArrays } = require('./utils');
const { loadConfig } = require('./config');
const { findNewestJava } = require('./java');
const { instanceDir } = require('./paths');
const { getMainWindow } = require('./windowState');

// ============================================================================
// INSTALACIÓN DE FORGE / FABRIC (@xmcl/installer)
// ============================================================================

// URL base de Forge en HTTPS. @xmcl/installer usa por defecto
// "http://files.minecraftforge.net/maven" (nótese el http://); ese host
// redirige (301) a https, y la versión de undici que trae la librería no
// sigue esa redirección aunque se le pida, así que hay que forzar https
// explícitamente en todas las llamadas (tanto para listar versiones como
// para descargar el instalador).
const FORGE_MAVEN_HTTPS = 'https://files.minecraftforge.net/maven';

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

// Ejecuta un Task de @xmcl/installer (la variante "Task" de sus funciones de
// instalación, que sí reporta progreso real en vez de solo "ha empezado/ha
// terminado") y reenvía ese progreso a la ventana como un paso más de la
// sincronización del modpack.
function runInstallTask(task, modpackId, labelPrefix) {
    return task.startAndWait({
        onUpdate: () => {
            const mainWindow = getMainWindow();
            if (!mainWindow || !task.total) return;
            const percent = Math.min(100, Math.round((task.progress / task.total) * 100));
            mainWindow.webContents.send('modpack-sync-progress', {
                label: `${labelPrefix}... ${percent}%`,
                percent,
                modpackId
            });
        }
    });
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
    await runInstallTask(installVersionTask(versionMeta, root), modpackId, 'Descargando Minecraft base');

    let versionId;
    if (loader === 'forge') {
        const forgeVersion = requestedLoaderVersion || await resolveForgeVersion(mcVersion);
        versionId = await runInstallTask(
            installForgeTask(
                { mcversion: mcVersion, version: forgeVersion },
                root,
                { mavenHost: FORGE_MAVEN_HTTPS, ...(javaPath ? { java: javaPath } : {}) }
            ),
            modpackId,
            'Instalando Forge'
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
            // Antes eran 12/12: con tantos archivos pequeños a la vez, un
            // antivirus escaneando cada uno en tiempo real puede saturar
            // disco y CPU y ralentizar todo el sistema, no solo el
            // launcher. 6/6 sigue siendo razonablemente rápido y es menos
            // agresivo.
            await runInstallTask(
                installDependenciesTask(resolved, { assetsDownloadConcurrency: 6, librariesDownloadConcurrency: 6 }),
                modpackId,
                `Descargando librerías de ${loader}`
            );
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

module.exports = {
    getForgeVersionsForMc,
    getFabricVersionsForMc,
    installLoaderForInstance
};
