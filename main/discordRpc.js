// Discord Rich Presence, opcional: sin un Client ID configurado (Ajustes,
// pantalla principal) no hace nada. El Client ID es de una aplicación de
// Discord que cada jugador tiene que crearse gratis en
// discord.com/developers/applications — Discord no deja mostrar presencia
// sin una, y no hay forma de compartir una sola para todos los usuarios del
// launcher (el propio Discord del jugador tiene que estar abierto además).
let DiscordRPCClient = null;
try {
    ({ Client: DiscordRPCClient } = require('@xhayper/discord-rpc'));
} catch (err) {
    console.warn('[WARN] @xhayper/discord-rpc no está instalado. Ejecuta "npm install" para poder usar Discord Rich Presence.');
}

let client = null;
let currentClientId = null;
let pendingActivity = null;

function ensureClient(clientId) {
    if (client && currentClientId === clientId) return client;
    if (client) {
        try { client.destroy(); } catch (err) { /* ya estaba desconectado */ }
    }

    client = new DiscordRPCClient({ clientId });
    currentClientId = clientId;

    // setActivity solo existe una vez el cliente está listo (evento "ready",
    // no la resolución de login()); si algo llama a setPresence justo
    // después de crear el cliente, se guarda en pendingActivity y se aplica
    // en cuanto esté disponible.
    client.on('ready', () => {
        if (pendingActivity && client.user) {
            client.user.setActivity(pendingActivity).catch(() => {});
        }
    });
    client.login().catch((err) => {
        // Lo normal es que Discord ni siquiera esté abierto en este
        // ordenador: no es un error real del launcher, solo "no hay nada
        // que mostrar ahora mismo".
        console.warn('[WARN] No se pudo conectar con Discord para Rich Presence (¿Discord está abierto?):', err.message);
    });
    return client;
}

function setPresence(clientId, activity) {
    if (!DiscordRPCClient || !clientId) return;
    pendingActivity = activity;
    const c = ensureClient(clientId);
    if (c.user) {
        c.user.setActivity(activity).catch(() => {});
    }
}

function clearPresence() {
    pendingActivity = null;
    if (client && client.user) {
        client.user.clearActivity().catch(() => {});
    }
}

function destroy() {
    if (client) {
        try { client.destroy(); } catch (err) { /* ignorar */ }
    }
    client = null;
    currentClientId = null;
    pendingActivity = null;
}

module.exports = { setPresence, clearPresence, destroy };
