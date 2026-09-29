const fs = require('fs');
const crypto = require('crypto');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { tm } = require('./i18nMain');

// Backends "gratis" (como el de Railway que usamos) pueden tardar bastante
// en despertar tras estar inactivos, y una petición colgada sin límite de
// tiempo se percibe como que el launcher se ha quedado colgado en vez de
// simplemente "tardando". Con un timeout, como mucho falla con un mensaje
// claro en vez de esperar para siempre.
async function fetchWithTimeout(url, options = {}, timeoutMs = 45000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(tm('sys.timeout'), { cause: err });
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

// Descarga url a destPath pasando por un "<destPath>.part": el archivo final
// solo aparece (rename) cuando la descarga ha terminado y, si se pide, el
// sha1 coincide. Así un corte a mitad o un archivo corrupto nunca se quedan
// con el nombre bueno, y el sha1 se calcula mientras llegan los datos en vez
// de volver a leer el archivo entero después.
//
// El timeout es de inactividad (se reinicia con cada trozo que llega), no
// total: con una conexión lenta un mod grande puede tardar varios minutos en
// bajar y eso no es un error, pero una conexión que deja de mandar datos sí.
//
// Los errores HTTP llevan err.status y un sha1 que no coincide lleva
// err.code === 'SHA1_MISMATCH', para que quien llama ponga su propio mensaje.
async function downloadToFile(url, destPath, { headers = {}, expectedSha1 = null, idleTimeoutMs = 60000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), idleTimeoutMs);
    const tmpPath = `${destPath}.part`;
    try {
        const res = await fetch(url, { headers, signal: controller.signal });
        if (!res.ok || !res.body) {
            const err = new Error(tm('sys.serverStatus', { status: res.status }));
            err.status = res.status;
            throw err;
        }

        const hash = crypto.createHash('sha1');
        const hashAndKeepAlive = new Transform({
            transform(chunk, _encoding, callback) {
                timer.refresh();
                hash.update(chunk);
                callback(null, chunk);
            }
        });
        await pipeline(Readable.fromWeb(res.body), hashAndKeepAlive, fs.createWriteStream(tmpPath));

        const actualSha1 = hash.digest('hex');
        if (expectedSha1 && actualSha1 !== expectedSha1) {
            const err = new Error(`El sha1 descargado (${actualSha1}) no coincide con el esperado (${expectedSha1}).`);
            err.code = 'SHA1_MISMATCH';
            throw err;
        }
        await fs.promises.rename(tmpPath, destPath);
        return actualSha1;
    } catch (err) {
        await fs.promises.rm(tmpPath, { force: true });
        if (controller.signal.aborted) {
            throw new Error(tm('sys.timeout'), { cause: err });
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// Mete un valor externo (id de modpack, token de invitación...) como UN
// segmento de la ruta de una URL. Sin esto, algo como "../modpacks/X/leave?x="
// pegado como "token de invitación" acababa llamando a otro endpoint
// distinto con la sesión del usuario: fetch resuelve los ".." de la ruta.
// encodeURIComponent no escapa los puntos, así que "." y ".." se rechazan
// aparte.
function encodePathSegment(value) {
    const str = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
    if (typeof str !== 'string' || str === '' || str === '.' || str === '..') {
        throw new Error(`Identificador no válido en la petición: ${JSON.stringify(value)}.`);
    }
    return encodeURIComponent(str);
}

// Plantilla etiquetada para construir rutas de la API con los valores
// escapados: apiPath`/api/modpacks/${id}/mods/${modId}`.
function apiPath(strings, ...values) {
    return strings.reduce((acc, part, i) => acc + part + (i < values.length ? encodePathSegment(values[i]) : ''), '');
}

// Reintentar un GET da igual; reintentar un POST cuya primera respuesta se
// perdió por timeout puede crear el modpack (o canjear la invitación) dos
// veces. Los métodos no idempotentes solo se reintentan si el error es de
// conexión, es decir, si está garantizado que la petición no llegó a salir.
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'PUT']);
const CONNECT_PHASE_ERROR_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']);

function isSafeToRetry(method, err) {
    if (IDEMPOTENT_METHODS.has(String(method || 'GET').toUpperCase())) return true;
    const code = err && err.cause && err.cause.code;
    return CONNECT_PHASE_ERROR_CODES.has(code);
}

// Solo https (o http a la propia máquina, para desarrollo): el token de
// sesión y el access token de Microsoft viajan a esta URL.
function isAllowedBackendUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch (err) {
        return false;
    }
    if (parsed.protocol === 'https:') return true;
    return parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
}

// La cabecera Content-Type de un servicio externo acaba dentro de un
// data: URI que el renderer pinta como <img src="...">. Solo se aceptan tipos
// de imagen conocidos; cualquier otra cosa (texto, HTML, comillas...) se
// descarta.
const ALLOWED_IMAGE_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function normalizeImageContentType(header) {
    const type = String(header || '').split(';')[0].trim().toLowerCase();
    return ALLOWED_IMAGE_CONTENT_TYPES.has(type) ? type : null;
}

module.exports = {
    fetchWithTimeout,
    downloadToFile,
    encodePathSegment,
    apiPath,
    isSafeToRetry,
    isAllowedBackendUrl,
    normalizeImageContentType
};
