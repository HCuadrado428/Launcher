const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { parseVersionFromDirName, compareVersionArrays } = require('./utils');

// ============================================================================
// DETECCIÓN AUTOMÁTICA DE JAVA (igual que antes)
// ============================================================================

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

// El conjunto de JDKs instalados no cambia solo durante la sesión del
// launcher (haría falta instalar/desinstalar uno y eso sí requiere
// reiniciar la app para que se note), así que no tiene sentido repetir el
// escaneo síncrono de varias carpetas del sistema (más caro todavía si hay
// un antivirus interceptando cada fs.existsSync/readdirSync) en cada
// arranque, cada cambio de cuenta y cada "usar vanilla". Mismo patrón que
// javaMajorCache un poco más abajo en este archivo.
let newestJavaCache;

function findNewestJava() {
    if (newestJavaCache !== undefined) return newestJavaCache;
    const candidates = findJavaCandidates();
    newestJavaCache = candidates.length === 0
        ? null
        : candidates.sort((a, b) => compareVersionArrays(b.version, a.version))[0].path;
    return newestJavaCache;
}

// La ruta de Java llega desde el renderer (campo de texto editable) y se
// ejecuta tal cual. Se exige que sea un ejecutable llamado java/javaw, y sin
// caracteres que una shell interpretaría, para que el campo no pueda usarse
// para lanzar cualquier otro programa.
const JAVA_EXECUTABLE_NAMES = new Set(['java', 'javaw', 'java.exe', 'javaw.exe']);

function isPlausibleJavaPath(javaPath) {
    if (typeof javaPath !== 'string') return false;
    const trimmed = javaPath.trim();
    if (!trimmed || /["`$\r\n]/.test(trimmed)) return false;
    const executableName = trimmed.split(/[\\/]/).pop().toLowerCase();
    return JAVA_EXECUTABLE_NAMES.has(executableName);
}

// ============================================================================
// COMPATIBILIDAD DE JAVA (aviso antes de lanzar, no bloqueante)
// ============================================================================

// Requisitos oficiales de Mojang: qué versión de Java hace falta como mínimo
// para cada rango de versiones de Minecraft.
const JAVA_REQUIREMENTS = [
    { maxVersion: [1, 16, 5], javaMajor: 8 },
    { maxVersion: [1, 17, 1], javaMajor: 16 },
    { maxVersion: [1, 20, 4], javaMajor: 17 }
    // Cualquier versión más nueva que 1.20.4 requiere Java 21+.
];

function requiredJavaMajorFor(mcVersion) {
    const v = parseVersionFromDirName(mcVersion);
    for (const req of JAVA_REQUIREMENTS) {
        if (compareVersionArrays(v, req.maxVersion) <= 0) return req.javaMajor;
    }
    return 21;
}

// Runtime de Java oficial de Mojang ("component") que corresponde a cada
// versión mínima de Java. Solo se usa como alternativa cuando no se puede
// leer el version.json de Mojang (sin conexión): lo normal es usar el
// javaVersion.component que trae ese json (ver getJavaRequirementForVersion).
const JAVA_COMPONENT_BY_MAJOR = {
    8: 'jre-legacy',
    16: 'java-runtime-alpha',
    17: 'java-runtime-gamma',
    21: 'java-runtime-delta'
};

function fallbackJavaRequirementFor(mcVersion) {
    const majorVersion = requiredJavaMajorFor(mcVersion);
    return { component: JAVA_COMPONENT_BY_MAJOR[majorVersion], majorVersion };
}

// Devuelve el "major" de la instalación de Java indicada (8, 17, 21...) o
// null si no se pudo determinar (ruta inválida, binario que no responde,
// formato de salida inesperado...). Nunca rechaza la promesa: esto es solo
// un aviso informativo, no debe poder bloquear el lanzamiento del juego.
// El Java instalado en una ruta dada no cambia de versión solo (haría falta
// reinstalarlo), así que no tiene sentido volver a lanzar el proceso
// "java -version" (con el arranque de la JVM que eso conlleva) en cada
// partida si ya lo comprobamos antes en esta misma sesión del launcher.
const javaMajorCache = new Map();

function getInstalledJavaMajor(javaPath) {
    if (javaMajorCache.has(javaPath)) {
        return Promise.resolve(javaMajorCache.get(javaPath));
    }
    return new Promise((resolve) => {
        execFile(javaPath, ['-version'], (err, stdout, stderr) => {
            const output = `${stdout || ''}${stderr || ''}`;
            const match = output.match(/version "(\d+)(?:\.(\d+))?/);
            const major = match
                // Formato antiguo "1.8.0_xxx" -> Java 8; formato moderno "17.0.1" -> Java 17.
                ? (parseInt(match[1], 10) === 1 && match[2] ? parseInt(match[2], 10) : parseInt(match[1], 10))
                : null;
            javaMajorCache.set(javaPath, major);
            resolve(major);
        });
    });
}

module.exports = {
    findJavaCandidates,
    findNewestJava,
    isPlausibleJavaPath,
    requiredJavaMajorFor,
    fallbackJavaRequirementFor,
    getInstalledJavaMajor
};
