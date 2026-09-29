// ============================================================================
// CUENTAS GUARDADAS (lógica pura)
// ============================================================================

// Añade/actualiza una cuenta en la lista guardada, identificándola por su
// "id" (estable entre sesiones: el uuid de Xbox para Microsoft, el nombre en
// minúsculas para offline). Repetir login con la misma identidad actualiza
// la entrada existente en vez de duplicarla.
function upsertAccount(accounts, account) {
    return [...accounts.filter((a) => a.id !== account.id), account];
}

// Lo que ve el renderer de cada cuenta guardada: nunca el token/auth interno,
// solo lo necesario para pintar la lista y poder pedir el cambio por id.
// "premium" viene de la sesión con el backend (true para Microsoft, false
// para offline) y decide si la UI deja compartir/generar invitaciones.
//
// Las sesiones guardadas antes de que existiera "premium" no tienen ese
// campo; si se tratara como "falta = no premium" se ocultaría el botón de
// invitar a cuentas Microsoft legítimas. Solo una cuenta offline puede
// tenerlo explícitamente en false (así lo devuelve /auth/verify-offline).
function toPublicAccount(account) {
    const premium = account.session
        ? account.session.premium !== false
        : account.type === 'microsoft';
    return {
        id: account.id,
        type: account.type,
        username: account.username,
        uuid: account.uuid || null,
        premium
    };
}

module.exports = { upsertAccount, toPublicAccount };
