// --- Servidores favoritos ---
// Solo local (no pasa por el backend, a diferencia de mods/config): cada
// jugador guarda su propia lista de accesos directos a servidores por
// instalación (vanilla o un modpack concreto), para no tener que volver a
// escribir la IP cada vez que quiere jugar con amigos.

async function currentInstanceIdForServers() {
    const cfg = await window.electronAPI.getConfig();
    return cfg && cfg.activeModpack ? cfg.activeModpack.id : null;
}

function favoriteServerItemHtml(server) {
    return `
        <div class="mod-item" data-id="${server.id}">
            <span>${escapeHtml(server.name)} · ${escapeHtml(server.address)}</span>
            <button class="mod-item-update" data-id="${server.id}" data-address="${escapeHtml(server.address)}" title="${t('servers.copy')}">📋</button>
            <button class="mod-item-remove" data-id="${server.id}" title="${t('servers.remove')}">&times;</button>
        </div>
    `;
}

async function refreshFavoriteServers() {
    const instanceId = await currentInstanceIdForServers();
    const servers = await window.electronAPI.getFavoriteServers(instanceId);
    favoriteServersList.innerHTML = servers.length
        ? servers.map(favoriteServerItemHtml).join('')
        : `<div class="empty-hint">${t('servers.empty')}</div>`;

    favoriteServersList.querySelectorAll('.mod-item-update').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(btn.dataset.address);
                showToast(t('servers.copied'), 'info');
            }
        });
    });
    favoriteServersList.querySelectorAll('.mod-item-remove').forEach((btn) => {
        btn.addEventListener('click', async () => {
            try {
                const instanceId = await currentInstanceIdForServers();
                await window.electronAPI.removeFavoriteServer(instanceId, btn.dataset.id);
                await refreshFavoriteServers();
            } catch (err) {
                showToast(err.message || t('servers.removeFailed'), 'error');
            }
        });
    });
}

addFavoriteServerBtn.addEventListener('click', async () => {
    const name = newServerName.value.trim();
    const address = newServerAddress.value.trim();
    if (!name || !address) {
        showToast(t('servers.missingFields'), 'error');
        return;
    }
    addFavoriteServerBtn.disabled = true;
    try {
        const instanceId = await currentInstanceIdForServers();
        await window.electronAPI.addFavoriteServer(instanceId, name, address);
        newServerName.value = '';
        newServerAddress.value = '';
        await refreshFavoriteServers();
    } catch (err) {
        showToast(err.message || t('servers.addFailed'), 'error');
    } finally {
        addFavoriteServerBtn.disabled = false;
    }
});
