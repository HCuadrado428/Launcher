const { loadConfig, saveConfig } = require('./config');

// RAM, ruta de Java y argumentos extra guardados por instalación ("vanilla"
// o el id de un modpack), en vez de un único valor global. Si una
// instalación no tiene ajustes propios todavía, se cae a los globales
// (configuraciones guardadas antes de que existiera esto).
//
// javaPath vacío significa "automático" (ver javaRuntime.js). Por eso se
// distingue "guardado vacío" (el jugador lo dejó en automático) de "nunca
// guardado" (se usa el valor global antiguo, si lo hay).
function targetKeyFor(modpackId) {
    return modpackId ? String(modpackId) : 'vanilla';
}

function getTargetSettings(modpackId) {
    const cfg = loadConfig();
    const saved = (cfg.perModpackSettings && cfg.perModpackSettings[targetKeyFor(modpackId)]) || {};
    return {
        javaPath: saved.javaPath !== undefined ? saved.javaPath : (cfg.javaPath || ''),
        memory: saved.memory || cfg.memory || null,
        customArgs: saved.customArgs || ''
    };
}

function saveTargetSettings(modpackId, settings) {
    const cfg = loadConfig();
    const perModpackSettings = { ...(cfg.perModpackSettings || {}) };
    perModpackSettings[targetKeyFor(modpackId)] = settings;
    saveConfig({ perModpackSettings });
}

module.exports = { targetKeyFor, getTargetSettings, saveTargetSettings };
