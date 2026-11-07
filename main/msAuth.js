// ============================================================================
// RENOVAR LA SESIÓN DE MICROSOFT ANTES DE JUGAR
// ============================================================================

// El token de Minecraft que da msmc caduca a las ~23 horas. Antes se guardaba
// al iniciar sesión y se reutilizaba para siempre, así que al día siguiente
// los servidores online rechazaban la sesión ("Invalid session") hasta volver
// a iniciar sesión a mano. Ahora el login guarda también el refresh token de
// Microsoft (mclc(true)) y antes de cada partida se renueva si hace falta.

// Margen para no lanzar con un token que caduque a los pocos minutos.
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

function needsRefresh(auth, now = Date.now()) {
    const exp = auth && auth.meta && auth.meta.exp;
    return typeof exp !== 'number' || exp - REFRESH_MARGIN_MS <= now;
}

function canRefresh(auth) {
    return Boolean(auth && auth.meta && auth.meta.refresh);
}

// No se usa fromMclcToken de msmc: en la 4.1.0 solo intenta renovar cuando
// el token todavía es válido (la condición está al revés).
async function refreshMinecraftAuth(auth, AuthClass) {
    const xbox = await new AuthClass('select_account').refresh(auth.meta.refresh);
    const minecraft = await xbox.getMinecraft();
    return minecraft.mclc(true);
}

// Devuelve { auth, refreshed, expired }:
// - refreshed: se obtuvo un token nuevo (hay que guardarlo).
// - expired: el token ha caducado y no se pudo renovar; se puede jugar en
//   un mundo individual, pero los servidores online lo rechazarán.
async function ensureFreshMinecraftAuth(auth, AuthClass, now = Date.now()) {
    if (!needsRefresh(auth, now)) return { auth, refreshed: false, expired: false };
    if (!AuthClass || !canRefresh(auth)) return { auth, refreshed: false, expired: true };
    try {
        return { auth: await refreshMinecraftAuth(auth, AuthClass), refreshed: true, expired: false };
    } catch (err) {
        console.warn('[WARN] No se pudo renovar la sesión de Microsoft:', err && err.message ? err.message : err);
        return { auth, refreshed: false, expired: true };
    }
}

module.exports = { needsRefresh, ensureFreshMinecraftAuth };
