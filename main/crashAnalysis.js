// ============================================================================
// PISTAS SOBRE POR QUÉ HA CRASHEADO EL JUEGO
// ============================================================================

// Busca en la salida del juego las causas más habituales de un cierre con
// error y devuelve un código ("javaTooOld", "missingDependency"...) que la
// interfaz traduce a un consejo concreto (claves crash.hint.* de i18n.js).
// El orden importa: las causas más específicas van primero.
const CRASH_PATTERNS = [
    { code: 'heapTooBig', re: /Could not reserve enough space for (?:object heap|\d+KB object heap)|Invalid maximum heap size|Invalid initial heap size/i },
    { code: 'badJvmArgs', re: /Unrecognized (?:VM )?option|Error: Could not create the Java Virtual Machine/i },
    { code: 'javaTooOld', re: /UnsupportedClassVersionError|has been compiled by a more recent version of the Java Runtime/i },
    { code: 'javaTooNew', re: /class jdk\.internal\.loader\.ClassLoaders\$AppClassLoader cannot be cast to class java\.net\.URLClassLoader/i },
    { code: 'outOfMemory', re: /java\.lang\.OutOfMemoryError/i },
    { code: 'duplicateMods', re: /Duplicate ?Mods ?Found|Found duplicate mods|DuplicateModsFoundException/i },
    { code: 'missingDependency', re: /Missing or unsupported mandatory dependencies|Incompatible mods? found|Mod resolution (?:failed|encountered)|requires (?:any version|version [^\n]*) of /i }
];

function analyzeCrashLog(text) {
    const log = String(text || '');
    for (const { code, re } of CRASH_PATTERNS) {
        if (re.test(log)) return code;
    }
    return null;
}

module.exports = { analyzeCrashLog };
