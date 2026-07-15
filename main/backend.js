const crypto = require('crypto');
const { loadConfig, saveConfig } = require('./config');
const { fetchWithTimeout } = require('./httpUtils');
const { getMainWindow } = require('./windowState');

// ============================================================================
// CLIENTE DE LA API DEL SERVIDOR DE MODPACKS
// ============================================================================

function getBackendUrl() {
    const cfg = loadConfig();
    return (cfg.backendUrl || 'https://serverminecraft-production.up.railway.app/').replace(/\/+$/, '');
}

// Hace una petición autenticada al backend. Lanza un error legible si algo
// falla, para que el renderer pueda mostrarlo directamente en un toast.
//
// Si el backend está "dormido" (Railway free tier lo apaga tras estar
// inactivo) la primera petición puede fallar por timeout o por un error de
// red antes de que termine de arrancar. En ese caso reintentamos un par de
// veces con espera creciente antes de rendirnos; un error HTTP normal (404,
// 403, 400...) NO se reintenta, porque reintentar no lo va a arreglar y hay
// que propagarlo tal cual para que el renderer lo muestre.
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

    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let res;
        try {
            res = await fetchWithTimeout(`${getBackendUrl()}${pathname}`, { method, headers, body: payload });
        } catch (networkErr) {
            if (attempt === MAX_ATTEMPTS) throw networkErr;
            await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
            continue;
        }

        let data = null;
        try { data = await res.json(); } catch (err) { /* respuesta sin cuerpo JSON */ }

        if (!res.ok) {
            // Un 401 significa que el JWT guardado (dura 30 días) ha caducado o
            // es inválido. err.status no sobrevive el paso por IPC hacia el
            // renderer (Electron solo serializa el .message de los errores
            // lanzados desde un ipcMain.handle), así que en vez de depender de
            // que cada llamante compruebe el status, cerramos la sesión aquí
            // mismo y avisamos al renderer por un evento aparte para que pueda
            // volver a la pantalla de login sin quedarse pillado repitiendo
            // "token inválido" en cada acción.
            if (res.status === 401) {
                saveConfig({ session: null });
                const mainWindow = getMainWindow();
                if (mainWindow) {
                    mainWindow.webContents.send('session-expired');
                }
            }
            const err = new Error((data && data.error) || `El servidor respondió con estado ${res.status}.`);
            err.status = res.status;
            throw err;
        }
        return data;
    }
}

// Mismo algoritmo que usan los servidores de Minecraft en modo offline
// (UUID v3/MD5 de "OfflinePlayer:<username>"). El backend recalcula este
// mismo uuid por su cuenta a partir del username que le mandamos (nunca
// confía en uno que le enviemos), así que esto es solo para tener el mismo
// valor disponible localmente sin depender de la respuesta del servidor.
function offlineUuidFromUsername(username) {
    const hash = crypto.createHash('md5').update(`OfflinePlayer:${username}`, 'utf8').digest();
    hash[6] = (hash[6] & 0x0f) | 0x30;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Registra/verifica una cuenta offline contra el backend: no hay ninguna
// identidad real que comprobar, así que solo hace falta el username. El
// backend la marca como premium=0 (ver requirePremium): puede crear y
// unirse a modpacks igual que una cuenta Microsoft, pero no compartir los
// suyos.
async function verifyOfflineSessionWithBackend(username) {
    const res = await fetchWithTimeout(`${getBackendUrl()}/api/auth/verify-offline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo registrar la cuenta offline con el servidor de modpacks.');
    return data;
}

// Verifica el access_token de Microsoft contra nuestro backend y guarda la
// sesión (JWT) resultante en la config local.
async function verifySessionWithBackend(accessToken) {
    const res = await fetchWithTimeout(`${getBackendUrl()}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo verificar la sesión con el servidor de modpacks.');
    saveConfig({ session: { token: data.token, uuid: data.uuid, username: data.username, premium: !!data.premium } });
    return data;
}

module.exports = {
    getBackendUrl,
    apiRequest,
    offlineUuidFromUsername,
    verifyOfflineSessionWithBackend,
    verifySessionWithBackend
};
