const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// loadConfig()/saveConfig() se llaman muchísimas veces por sesión (cada
// petición al backend comprueba la sesión, cada paso de progreso puede
// tocar la config...). Releer y parsear el archivo entero del disco cada
// vez es trabajo de sobra para un archivo que solo cambia cuando nosotros
// lo cambiamos, así que se mantiene en memoria y solo se toca el disco de
// verdad al guardar. Cada llamada a loadConfig() devuelve una copia
// superficial para que quien la reciba pueda mutarla libremente (hay sitios
// que hacen eso) sin corromper la caché por accidente.
let configCache = null;

// config.json guarda el token de sesión del backend y el access_token de
// Microsoft de cada cuenta (mclcAuth) — texto plano ahí era un secreto de
// hasta 30 días legible por cualquiera con acceso al disco. safeStorage usa
// el almacén de credenciales del sistema (DPAPI en Windows, Keychain en
// macOS) para cifrar el archivo en reposo. Si no está disponible (p. ej. sin
// keychain configurado en Linux) se cae a texto plano en vez de romper la
// app. readConfigFile() también sabe leer un config.json antiguo sin cifrar
// (de antes de este cambio) probando el JSON.parse directo si el
// descifrado falla.
function readConfigFile() {
    const raw = fs.readFileSync(CONFIG_PATH);
    if (safeStorage.isEncryptionAvailable()) {
        try {
            return JSON.parse(safeStorage.decryptString(raw));
        } catch (err) {
            // No cifrado todavía (versión anterior) o corrupto; probamos texto plano.
        }
    }
    return JSON.parse(raw.toString('utf-8'));
}

function writeConfigFile(merged) {
    const json = JSON.stringify(merged, null, 2);
    if (safeStorage.isEncryptionAvailable()) {
        fs.writeFileSync(CONFIG_PATH, safeStorage.encryptString(json));
    } else {
        fs.writeFileSync(CONFIG_PATH, json);
    }
}

function loadConfig() {
    if (configCache === null) {
        try {
            configCache = readConfigFile();
        } catch (err) {
            configCache = {};
        }
    }
    return { ...configCache };
}

function saveConfig(partial) {
    try {
        const current = configCache || loadConfig();
        const merged = { ...current, ...partial };
        writeConfigFile(merged);
        configCache = merged;
        return { ...merged };
    } catch (err) {
        console.error('[ERROR] No se pudo guardar la config:', err);
        configCache = null;
        return loadConfig();
    }
}

module.exports = { loadConfig, saveConfig };
