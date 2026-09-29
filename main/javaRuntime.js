const fs = require('fs');
const path = require('path');
const { fetchJavaRuntimeManifest, installJavaRuntimeTask } = require('@xmcl/installer');
const { VANILLA_ROOT } = require('./paths');
const { findNewestJava } = require('./java');
const { getJavaRequirementForVersion } = require('./mojang');
const { createSingleFlight } = require('./instanceLock');

// ============================================================================
// JAVA AUTOMÁTICO (runtimes oficiales de Mojang)
// ============================================================================

// Cada versión de Minecraft necesita un Java concreto: 1.16.5 y anteriores
// van con Java 8 (Forge antiguo ni siquiera arranca con uno más nuevo), 1.17
// con 16, 1.18–1.20.4 con 17, 1.20.5+ con 21... Usar "el Java más nuevo
// instalado" para todo rompía justo esos casos. Cuando el jugador deja vacío
// el campo de Java, se descarga (una vez) el mismo runtime que usa el
// launcher oficial y se reutiliza entre instancias.
const RUNTIME_ROOT = path.join(VANILLA_ROOT, 'runtime');
const MARKER_FILE = '.ember-runtime.json';

function runtimeDir(component) {
    return path.join(RUNTIME_ROOT, component);
}

// Se usa java y no javaw: minecraft-launcher-core comprueba la versión con
// "<java> -version" leyendo su salida, y javaw no la escribe.
function runtimeExecutablePath(component) {
    const dir = runtimeDir(component);
    if (process.platform === 'win32') return path.join(dir, 'bin', 'java.exe');
    if (process.platform === 'darwin') return path.join(dir, 'jre.bundle', 'Contents', 'Home', 'bin', 'java');
    return path.join(dir, 'bin', 'java');
}

function isRuntimeInstalled(component) {
    return fs.existsSync(path.join(runtimeDir(component), MARKER_FILE)) && fs.existsSync(runtimeExecutablePath(component));
}

async function installRuntime(component, onProgress) {
    const destination = runtimeDir(component);
    const manifest = await fetchJavaRuntimeManifest({ target: component });
    const task = installJavaRuntimeTask({ destination, manifest });
    await task.startAndWait({
        onUpdate: () => {
            if (onProgress && task.total) onProgress(task.progress, task.total);
        }
    });

    // @xmcl/installer descarga los archivos pero no les pone permisos de
    // ejecución; en Linux/macOS hay que hacerlo a mano con lo que el propio
    // manifiesto marca como ejecutable.
    if (process.platform !== 'win32') {
        for (const [file, entry] of Object.entries(manifest.files)) {
            if (entry.type === 'file' && entry.executable) {
                await fs.promises.chmod(path.join(destination, file), 0o755);
            }
        }
    }

    // El marcador se escribe al final: si la descarga se corta, la siguiente
    // vez se vuelve a intentar (y @xmcl se salta lo que ya esté bien).
    await fs.promises.writeFile(
        path.join(destination, MARKER_FILE),
        JSON.stringify({ component, version: manifest.version }, null, 2)
    );
}

// Dos lanzamientos seguidos (o sincronizar + lanzar) que necesiten el mismo
// runtime comparten una sola descarga.
const joinInstall = createSingleFlight();

async function ensureJavaRuntime(component, onProgress) {
    if (!isRuntimeInstalled(component)) {
        await joinInstall(component, () => installRuntime(component, onProgress));
    }
    return runtimeExecutablePath(component);
}

// Decide qué Java usar para una versión de Minecraft:
// - Si el jugador escribió una ruta, se respeta tal cual.
// - Si no, el runtime de Mojang para esa versión (descargándolo si hace
//   falta). Si eso falla (sin conexión, plataforma sin runtime...), el Java
//   más nuevo instalado en el sistema, avisando del motivo.
// Devuelve { path, auto, majorVersion, warning } o { path: null } si no hay
// ningún Java utilizable.
async function resolveJavaForVersion(mcVersion, explicitPath, onProgress) {
    const trimmed = typeof explicitPath === 'string' ? explicitPath.trim() : '';
    if (trimmed) return { path: trimmed, auto: false };

    const requirement = await getJavaRequirementForVersion(mcVersion);
    try {
        const javaPath = await ensureJavaRuntime(requirement.component, onProgress
            ? (done, total) => onProgress(requirement.majorVersion, done, total)
            : null);
        return { path: javaPath, auto: true, majorVersion: requirement.majorVersion };
    } catch (err) {
        console.warn(`[WARN] No se pudo preparar el runtime de Java ${requirement.component}:`, err.message);
        return {
            path: findNewestJava(),
            auto: false,
            majorVersion: requirement.majorVersion,
            warning: err.message || String(err)
        };
    }
}

module.exports = { resolveJavaForVersion, ensureJavaRuntime, runtimeExecutablePath };
