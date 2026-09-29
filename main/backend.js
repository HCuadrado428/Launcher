const crypto = require('crypto');
const { loadConfig, saveConfig } = require('./config');
const { fetchWithTimeout, isSafeToRetry, isAllowedBackendUrl } = require('./httpUtils');
const { sendToWindow } = require('./windowState');
const { tm } = require('./i18nMain');

// ============================================================================
// CLIENTE DE LA API DEL SERVIDOR DE MODPACKS
// ============================================================================

const DEFAULT_BACKEND_URL = 'https://serverminecraft-production.up.railway.app';

function getBackendUrl() {
    const custom = (loadConfig().backendUrl || '').replace(/\/+$/, '');
    return custom && isAllowedBackendUrl(custom) ? custom : DEFAULT_BACKEND_URL;
}

// Hace una petición autenticada al backend. Lanza un error legible si algo
// falla, para que el renderer pueda mostrarlo directamente en un toast.
//
// Token de la sesión con el backend, o un error legible si no hay sesión.
function requireSessionToken() {
    const cfg = loadConfig();
    if (!cfg.session || !cfg.session.token) {
        throw new Error(tm('sys.sessionRequired'));
    }
    return cfg.session.token;
}

async function readJsonSafely(res) {
    try {
        return await res.json();
    } catch (err) {
        return null; // respuesta sin cuerpo JSON (p.ej. una página de error del proxy)
    }
}

// Convierte una respuesta de error del backend en un Error con .status.
//
// Un 401 significa que el JWT guardado (dura 30 días) ha caducado o es
// inválido. err.status no sobrevive el paso por IPC hacia el renderer
// (Electron solo serializa el .message de los errores lanzados desde un
// ipcMain.handle), así que en vez de depender de que cada llamante compruebe
// el status, se cierra la sesión aquí mismo y se avisa al renderer por un
// evento aparte para que vuelva a la pantalla de login.
function errorFromResponse(res, data, fallbackMessage) {
    if (res.status === 401) {
        saveConfig({ session: null });
        sendToWindow('session-expired');
    }
    const err = new Error((data && data.error) || fallbackMessage || tm('sys.serverStatus', { status: res.status }));
    err.status = res.status;
    return err;
}

// Hace una petición autenticada al backend. Lanza un error legible si algo
// falla, para que el renderer pueda mostrarlo directamente en un toast.
//
// Si el backend está "dormido" (Railway free tier lo apaga tras estar
// inactivo) la primera petición puede fallar por timeout o por un error de
// red antes de que termine de arrancar. En ese caso reintentamos un par de
// veces con espera creciente antes de rendirnos; un error HTTP normal (404,
// 403, 400...) NO se reintenta, porque reintentar no lo va a arreglar y hay
// que propagarlo tal cual para que el renderer lo muestre. Un POST solo se
// reintenta si es seguro que no llegó al servidor (ver isSafeToRetry).
//
// pathname debe construirse con apiPath`...` (httpUtils) cuando lleva ids o
// tokens, para que vayan escapados.
async function apiRequest(pathname, { method = 'GET', body } = {}) {
    const headers = { Authorization: `Bearer ${requireSessionToken()}` };
    let payload;
    if (body) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }

    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let res;
        try {
            res = await fetchWithTimeout(`${getBackendUrl()}${pathname}`, { method, headers, body: payload });
        } catch (networkErr) {
            if (attempt === MAX_ATTEMPTS || !isSafeToRetry(method, networkErr)) throw networkErr;
            await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
            continue;
        }

        const data = await readJsonSafely(res);
        if (!res.ok) throw errorFromResponse(res, data);
        return data;
    }
}

// Sube un formulario multipart (mods, config compartida) al backend. Tiene
// un timeout más largo que el resto de peticiones porque cuenta la subida
// entera, y no se reintenta: una subida a medias ya ha gastado la conexión y
// repetirla podría duplicar el archivo.
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

async function uploadForm(pathname, form, { method = 'POST', fallbackError } = {}) {
    const res = await fetchWithTimeout(`${getBackendUrl()}${pathname}`, {
        method,
        headers: { Authorization: `Bearer ${requireSessionToken()}` },
        body: form
    }, UPLOAD_TIMEOUT_MS);
    const data = await readJsonSafely(res);
    if (!res.ok) throw errorFromResponse(res, data, fallbackError);
    return data;
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
    const data = await readJsonSafely(res);
    if (!res.ok || !data) throw new Error((data && data.error) || tm('sys.serverStatus', { status: res.status }));
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
    const data = await readJsonSafely(res);
    if (!res.ok || !data) throw new Error((data && data.error) || tm('sys.serverStatus', { status: res.status }));
    saveConfig({ session: { token: data.token, uuid: data.uuid, username: data.username, premium: !!data.premium } });
    return data;
}

module.exports = {
    getBackendUrl,
    requireSessionToken,
    apiRequest,
    uploadForm,
    offlineUuidFromUsername,
    verifyOfflineSessionWithBackend,
    verifySessionWithBackend
};
