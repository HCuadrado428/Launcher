const fs = require('fs');
const {
    installForgeTask,
    installNeoForgedTask,
    installFabric,
    installQuiltVersion,
    getQuiltLoaderVersionsByMinecraft,
    getLoaderArtifactListFor,
    installDependenciesTask,
    installVersionTask,
    getVersionList
} = require('@xmcl/installer');
const { Version } = require('@xmcl/core');
const { parseVersionFromDirName, compareVersionArrays } = require('./utils');
const { instanceDir } = require('./paths');
const { sendToWindow } = require('./windowState');
const { fetchWithTimeout } = require('./httpUtils');
const { tm } = require('./i18nMain');
const { neoForgeVersionsForMc, quiltVersionsFromMeta } = require('./loaderVersions');

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
//
// maven-metadata.xml lista TODAS las builds de Forge de todas las versiones
// (más de 1 MB) y antes se descargaba entero cada vez que se cambiaba la
// versión en el selector de "Crear modpack". Ahora se guarda en memoria un
// rato, junto con promotions_slim.json.
const FORGE_METADATA_TTL_MS = 30 * 60 * 1000;
const FORGE_FETCH_TIMEOUT_MS = 30000;
let forgeMetadataCache = null;

async function getForgeMetadata() {
    if (forgeMetadataCache && Date.now() - forgeMetadataCache.fetchedAt < FORGE_METADATA_TTL_MS) {
        return forgeMetadataCache;
    }
    const [metaRes, promoRes] = await Promise.all([
        fetchWithTimeout('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml', {}, FORGE_FETCH_TIMEOUT_MS),
        fetchWithTimeout('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', {}, FORGE_FETCH_TIMEOUT_MS)
            .catch(() => null)
    ]);
    if (!metaRes.ok) throw new Error(tm('sys.forgeVersionsFailed', { status: metaRes.status }));

    const xml = await metaRes.text();
    const promos = promoRes && promoRes.ok ? ((await promoRes.json()).promos || {}) : {};
    forgeMetadataCache = { xml, promos, fetchedAt: Date.now() };
    return forgeMetadataCache;
}

async function getForgeVersionsForMc(mcVersion) {
    const { xml, promos } = await getForgeMetadata();
    const prefix = `${mcVersion}-`;
    const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)]
        .map((m) => m[1])
        .filter((v) => v.startsWith(prefix))
        .map((v) => v.slice(prefix.length));
    const unique = [...new Set(versions)];
    unique.sort((a, b) => compareVersionArrays(parseVersionFromDirName(b), parseVersionFromDirName(a)));

    const recommended = promos[`${mcVersion}-recommended`] || null;
    const latest = promos[`${mcVersion}-latest`] || null;

    return unique.map((version) => ({
        version,
        recommended: version === recommended,
        latest: version === latest
    }));
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

// NeoForge: su maven-metadata.xml lista todas las builds (de todas las
// versiones de Minecraft); se cachea igual que el de Forge.
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases';
let neoForgeMetadataCache = null;

async function getNeoForgeVersionsForMc(mcVersion) {
    if (!neoForgeMetadataCache || Date.now() - neoForgeMetadataCache.fetchedAt >= FORGE_METADATA_TTL_MS) {
        const res = await fetchWithTimeout(`${NEOFORGE_MAVEN}/net/neoforged/neoforge/maven-metadata.xml`, {}, FORGE_FETCH_TIMEOUT_MS);
        if (!res.ok) throw new Error(tm('sys.loaderVersionsFailed', { loader: 'NeoForge', status: res.status }));
        const xml = await res.text();
        neoForgeMetadataCache = {
            versions: [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]),
            fetchedAt: Date.now()
        };
    }
    return neoForgeVersionsForMc(neoForgeMetadataCache.versions, mcVersion);
}

async function getQuiltVersionsForMc(mcVersion) {
    return quiltVersionsFromMeta(await getQuiltLoaderVersionsByMinecraft({ minecraftVersion: mcVersion }));
}

// Lista de versiones para el selector de "Crear modpack", sea cual sea el
// loader.
function getLoaderVersionsForMc(loader, mcVersion) {
    switch (loader) {
        case 'forge': return getForgeVersionsForMc(mcVersion);
        case 'neoforge': return getNeoForgeVersionsForMc(mcVersion);
        case 'fabric': return getFabricVersionsForMc(mcVersion);
        case 'quilt': return getQuiltVersionsForMc(mcVersion);
        default: return Promise.resolve([]);
    }
}

// La versión recomendada de un loader (para modpacks creados antes de poder
// elegir versión, o importados sin ella).
async function resolveRecommendedLoaderVersion(loader, mcVersion) {
    const list = await getLoaderVersionsForMc(loader, mcVersion);
    const pick = list.find((v) => v.recommended) || list.find((v) => v.latest) || list[0];
    if (!pick) throw new Error(tm('sys.noLoaderVersion', { loader: LOADER_NAMES[loader] || loader, version: mcVersion }));
    return pick.version;
}

const LOADER_NAMES = { forge: 'Forge', neoforge: 'NeoForge', fabric: 'Fabric', quilt: 'Quilt' };

// Ejecuta un Task de @xmcl/installer (la variante "Task" de sus funciones de
// instalación, que sí reporta progreso real en vez de solo "ha empezado/ha
// terminado") y reenvía ese progreso a la ventana como un paso más de la
// sincronización del modpack.
function runInstallTask(task, modpackId, labelPrefix) {
    return task.startAndWait({
        onUpdate: () => {
            if (!task.total) return;
            const percent = Math.min(100, Math.round((task.progress / task.total) * 100));
            sendToWindow('modpack-sync-progress', {
                label: `${labelPrefix}... ${percent}%`,
                percent,
                modpackId
            });
        }
    });
}

// Instala Forge o Fabric dentro de la carpeta de la instancia del modpack y
// devuelve el "version id" instalado, que es lo que hay que pasar como
// como versión a lanzar (ver gameLauncher.js) para jugar con ese
// loader. No hace nada (devuelve null) si el modpack es vanilla.
//
// requestedLoaderVersion es la build concreta que eligió el creador del
// modpack (p.ej. "47.4.10" o "0.19.3"). Si viene vacía (modpacks antiguos,
// creados antes de poder elegir versión), se resuelve automáticamente la
// recomendada.
//
// javaPath es el Java con el que se ejecutan los procesadores del instalador
// de Forge (el mismo que usará el juego, ver javaRuntime.js); null deja que
// @xmcl/installer use el "java" del PATH.
//
// installVersionTask por sí solo instala también los assets/librerías
// vanilla (miles de archivos pequeños: sonidos, idiomas, texturas...), no
// solo el .jar y el version.json — sin esto se quedaba con la concurrencia
// por defecto de @xmcl/installer (sin ajustar, a diferencia del paso de
// abajo), que puede ser bastante más baja. Con miles de archivos, la
// diferencia entre esa concurrencia por defecto y una explícita se nota
// literalmente en minutos: es la causa más probable de que la primera
// sincronización de un modpack con Forge/Fabric tarde muchísimo.
const INSTALL_CONCURRENCY = { assetsDownloadConcurrency: 10, librariesDownloadConcurrency: 10 };

async function installLoaderForInstance(modpackId, mcVersion, loader, requestedLoaderVersion, javaPath) {
    if (!LOADER_NAMES[loader]) return null;

    const root = instanceDir(modpackId);
    fs.mkdirSync(root, { recursive: true });

    // El instalador de Forge necesita que el .jar vanilla de esa versión ya
    // esté en disco (lo usa para post-procesarlo con "jarsplitter"), así que
    // instalamos primero la versión vanilla base antes de instalar el loader.
    const versionList = await getVersionList();
    const versionMeta = versionList.versions.find((v) => v.id === mcVersion);
    if (!versionMeta) throw new Error(tm('sys.unknownMcVersion', { version: mcVersion }));
    await runInstallTask(installVersionTask(versionMeta, root, INSTALL_CONCURRENCY), modpackId, tm('sys.progress.baseMinecraft'));

    const loaderVersion = requestedLoaderVersion || await resolveRecommendedLoaderVersion(loader, mcVersion);
    const javaOption = javaPath ? { java: javaPath } : {};
    let versionId;
    if (loader === 'forge') {
        versionId = await runInstallTask(
            installForgeTask({ mcversion: mcVersion, version: loaderVersion }, root, { mavenHost: FORGE_MAVEN_HTTPS, ...javaOption }),
            modpackId,
            tm('sys.progress.installingLoader', { loader: 'Forge' })
        );
    } else if (loader === 'neoforge') {
        versionId = await runInstallTask(
            installNeoForgedTask('neoforge', loaderVersion, root, javaOption),
            modpackId,
            tm('sys.progress.installingLoader', { loader: 'NeoForge' })
        );
    } else if (loader === 'quilt') {
        versionId = await installQuiltVersion({ minecraftVersion: mcVersion, version: loaderVersion, minecraft: root });
    } else {
        versionId = await installFabric({ minecraftVersion: mcVersion, version: loaderVersion, minecraft: root });
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
            // Esto había bajado antes de 12/12 a 6/6 porque con tantos
            // archivos pequeños a la vez, un antivirus escaneando cada uno
            // en tiempo real puede saturar disco y CPU y ralentizar todo el
            // sistema. Pero 6/6 combinado con installVersionTask (arriba)
            // sin ninguna concurrencia ajustada hacía que la primera
            // sincronización de un modpack pudiera tardar del orden de
            // minutos con miles de archivos pequeños de por medio. 10/10 es
            // un punto medio: sigue siendo bastante menos agresivo que el
            // 12/12 original.
            await runInstallTask(
                installDependenciesTask(resolved, INSTALL_CONCURRENCY),
                modpackId,
                tm('sys.progress.loaderLibraries', { loader })
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
    getLoaderVersionsForMc,
    installLoaderForInstance
};
