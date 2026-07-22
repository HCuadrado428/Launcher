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
            throw new Error('El servidor ha tardado demasiado en responder (puede estar arrancando tras estar inactivo). Inténtalo de nuevo en unos segundos.', { cause: err });
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = { fetchWithTimeout };
