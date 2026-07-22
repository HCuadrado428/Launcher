// --- Instalación activa (vanilla o modpack) ---

async function updateActiveModpackLabel(activeModpack) {
    if (activeModpack) {
        let loaderSuffix = '';
        if (activeModpack.loader && activeModpack.loader !== 'vanilla') {
            const loaderName = activeModpack.loader[0].toUpperCase() + activeModpack.loader.slice(1);
            loaderSuffix = activeModpack.loader_version
                ? ` · ${loaderName} ${activeModpack.loader_version}`
                : ` · ${loaderName}`;
        }
        activeModpackLabel.innerText = t('label.modpackActive', { name: activeModpack.name, version: activeModpack.mc_version }) + loaderSuffix;
    } else {
        activeModpackLabel.innerText = t('label.vanillaChecking');
        window.electronAPI.getLatestVersion().then((version) => {
            if (!document.getElementById('mainScreen').dataset.modpackActive) {
                activeModpackLabel.innerText = t('label.vanillaVersion', { version });
            }
        });
    }
}

openModpacksBtn.addEventListener('click', () => {
    showScreen('modpacksScreen');
    loadModpacks();
    ensureReleaseVersionsLoaded();
    refreshBackendStatus();
});

// --- Estado del servidor ---
// El backend gratuito puede estar dormido; este puntito avisa de eso antes
// de que el usuario intente abrir/crear un modpack y se encuentre un error.

const backendStatusDotEl = backendStatusDot.querySelector('.status-dot');

async function refreshBackendStatus() {
    backendStatusDotEl.className = 'status-dot checking';
    backendStatusText.innerText = t('backend.status.checking');
    const result = await window.electronAPI.checkBackendStatus();
    if (result && result.ok) {
        backendStatusDotEl.className = 'status-dot ok';
        backendStatusText.innerText = t('backend.status.ok');
    } else {
        backendStatusDotEl.className = 'status-dot down';
        backendStatusText.innerText = t('backend.status.down');
    }
}

setInterval(() => {
    if (modpacksScreen.classList.contains('active')) refreshBackendStatus();
}, 45000);

backToMainBtn.addEventListener('click', () => showScreen('mainScreen'));

useVanillaBtn.addEventListener('click', async () => {
    await window.electronAPI.selectActiveModpack(null, null, null, null);
    document.getElementById('mainScreen').dataset.modpackActive = '';
    updateActiveModpackLabel(null);
    await applyTargetSettings(null);
    showToast(t('toast.vanillaSelected'), 'info');
    showScreen('mainScreen');
});

// ============================================================================
// MODPACKS
// ============================================================================

// Aviso puntual (no ligado a la barra de progreso, que enseguida pasa a
// mostrar "Descargando X..." archivo a archivo) de cuánto se va a descargar
// en total, útil para conexiones lentas o limitadas.
window.electronAPI.onModpackDownloadEstimate((data) => {
    showToast(t('toast.downloadEstimate', { size: formatBytes(data.totalBytes), count: data.fileCount }), 'info');
});

let releaseVersionsCache = null;

async function ensureReleaseVersionsLoaded() {
    if (releaseVersionsCache) return releaseVersionsCache;
    const versions = await window.electronAPI.getReleaseVersions();
    releaseVersionsCache = versions;
    newModpackVersion.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join('');
    return versions;
}

// Al elegir Forge/Fabric se rellena un tercer <select> con todas las builds
// disponibles para la versión de Minecraft elegida, marcando y preseleccionando
// la recomendada (o la estable más reciente en el caso de Fabric).
async function updateLoaderVersionOptions() {
    const loader = newModpackLoader.value;
    if (loader === 'vanilla') {
        loaderVersionField.style.display = 'none';
        newModpackLoaderVersion.innerHTML = '';
        return;
    }

    const mcVersion = newModpackVersion.value;
    if (!mcVersion) return;

    loaderVersionField.style.display = '';
    newModpackLoaderVersion.innerHTML = `<option value="">${t('modpacks.create.loaderVersion.loading')}</option>`;

    try {
        const list = loader === 'forge'
            ? await window.electronAPI.getForgeVersions(mcVersion)
            : await window.electronAPI.getFabricVersions(mcVersion);

        if (!list.length) {
            newModpackLoaderVersion.innerHTML = `<option value="">${t('modpacks.create.loaderVersion.empty')}</option>`;
            return;
        }

        newModpackLoaderVersion.innerHTML = list.map(v => {
            const tag = v.recommended ? ` (${t('modpacks.create.loaderVersion.recommended')})` : '';
            return `<option value="${v.version}">${v.version}${tag}</option>`;
        }).join('');

        const recommended = list.find(v => v.recommended);
        if (recommended) newModpackLoaderVersion.value = recommended.version;
    } catch (err) {
        newModpackLoaderVersion.innerHTML = `<option value="">${t('modpacks.create.loaderVersion.empty')}</option>`;
        showToast(err.message || t('modpacks.create.loaderVersion.empty'), 'error');
    }
}

newModpackLoader.addEventListener('change', updateLoaderVersionOptions);
newModpackVersion.addEventListener('change', updateLoaderVersionOptions);

function modpackItemHtml(pack, isOwner) {
    const icon = LOADER_ICONS[pack.loader] || '📦';
    const iconHtml = pack.cover_image
        ? `<img src="${pack.cover_image}" alt="">`
        : icon;
    return `
        <div class="modpack-card" data-id="${pack.id}">
            <div class="modpack-card-icon${pack.cover_image ? ' has-cover' : ''}">${iconHtml}</div>
            <div class="modpack-card-info">
                <div class="modpack-card-name">${escapeHtml(pack.name)} ${loaderBadgeHtml(pack.loader, pack.loader_version)}</div>
                <div class="modpack-card-meta">MC ${escapeHtml(pack.mc_version)}${isOwner ? t('modpacks.owner.suffix') : ''}</div>
            </div>
            <div class="modpack-card-actions">
                <button class="secondary manage-btn" data-id="${pack.id}" data-name="${escapeHtml(pack.name)}" data-version="${escapeHtml(pack.mc_version)}" data-loader="${escapeHtml(pack.loader || 'vanilla')}" data-is-owner="${isOwner}">${isOwner ? t('modpacks.manage') : t('modpacks.manageShared')}</button>
                <button class="select-btn" data-id="${pack.id}" data-name="${escapeHtml(pack.name)}" data-version="${escapeHtml(pack.mc_version)}" data-loader="${escapeHtml(pack.loader || 'vanilla')}" data-loader-version="${escapeHtml(pack.loader_version || '')}">${t('modpacks.play')}</button>
            </div>
        </div>
    `;
}

let lastLoadedModpacks = { owned: [], shared: [] };

// Separado de loadModpacks() para poder re-pintar solo con el filtro del
// buscador sin tener que volver a pedir la lista al servidor cada vez que
// el usuario teclea.
function renderModpackLists() {
    const query = modpackSearchInput.value.trim().toLowerCase();
    const matches = (p) => !query || p.name.toLowerCase().includes(query);
    const owned = lastLoadedModpacks.owned.filter(matches);
    const shared = lastLoadedModpacks.shared.filter(matches);
    const emptyOwnedKey = query ? 'modpacks.search.empty' : 'modpacks.empty.owned';
    const emptySharedKey = query ? 'modpacks.search.empty' : 'modpacks.empty.shared';

    ownedModpacksList.innerHTML = owned.length
        ? owned.map(p => modpackItemHtml(p, true)).join('')
        : `<div class="empty-hint">${t(emptyOwnedKey)}</div>`;

    sharedModpacksList.innerHTML = shared.length
        ? shared.map(p => modpackItemHtml(p, false)).join('')
        : `<div class="empty-hint">${t(emptySharedKey)}</div>`;

    document.querySelectorAll('.manage-btn').forEach(btn => {
        btn.addEventListener('click', () => openModsModal(btn.dataset.id, btn.dataset.name, btn.dataset.version, btn.dataset.loader, btn.dataset.isOwner === 'true'));
    });
    document.querySelectorAll('.select-btn').forEach(btn => {
        btn.addEventListener('click', () => selectAndSyncModpack(btn.dataset.id, btn.dataset.name, btn.dataset.version, btn.dataset.loader, btn.dataset.loaderVersion, btn));
    });
}

// Repintar toda la lista de tarjetas en cada pulsación no hace falta:
// esperar un poco a que el usuario pare de teclear evita reconstruir el HTML
// entero varias veces por segundo mientras escribe.
modpackSearchInput.addEventListener('input', debounce(renderModpackLists, 150));

// Best-effort: si falla (backend caído, cuenta sin sesión) simplemente no
// se muestra la barra en vez de romper la carga de la lista de modpacks.
async function loadStorageUsage() {
    try {
        const { used_bytes, limit_bytes } = await window.electronAPI.getStorageUsage();
        const percent = limit_bytes > 0 ? Math.min(100, (used_bytes / limit_bytes) * 100) : 0;
        storageUsageFill.style.width = `${percent}%`;
        storageUsageFill.classList.toggle('storage-usage-warning', percent >= 90);
        storageUsageText.textContent = t('modpacks.storage.usage', {
            used: formatBytes(used_bytes),
            limit: formatBytes(limit_bytes)
        });
        storageUsageBar.style.display = '';
    } catch (err) {
        storageUsageBar.style.display = 'none';
    }
}

async function loadModpacks() {
    ownedModpacksList.innerHTML = skeletonCardsHtml(2);
    sharedModpacksList.innerHTML = skeletonCardsHtml(2);
    loadStorageUsage();
    try {
        const data = await window.electronAPI.getMyModpacks();
        lastLoadedModpacks = data;
        renderModpackLists();

        // Si el modpack activo ya no aparece en la lista (borrado por el
        // creador, o perdimos el acceso), lo limpiamos también aquí sin
        // esperar a que el usuario pulse "Iniciar Juego".
        const cfg = await window.electronAPI.getConfig();
        if (cfg && cfg.activeModpack) {
            const stillThere = [...data.owned, ...data.shared].some(p => p.id === cfg.activeModpack.id);
            if (!stillThere) {
                await window.electronAPI.selectActiveModpack(null, null, null, null);
                document.getElementById('mainScreen').dataset.modpackActive = '';
                updateActiveModpackLabel(null);
            }
        }
    } catch (err) {
        ownedModpacksList.innerHTML = '';
        sharedModpacksList.innerHTML = '';
        showToast(err.message || t('toast.modpackListLoadFailed'), 'error');
    }
}

createModpackBtn.addEventListener('click', async () => {
    const name = newModpackName.value.trim();
    const version = newModpackVersion.value;
    const loader = newModpackLoader.value;
    const loaderVersion = loader !== 'vanilla' ? newModpackLoaderVersion.value : '';
    if (!name || !version) {
        showToast(t('toast.modpackCreateMissingFields'), 'error');
        return;
    }
    try {
        await window.electronAPI.createModpack(name, version, loader, loaderVersion);
        newModpackName.value = '';
        showToast(t('toast.modpackCreated'), 'info');
        loadModpacks();
    } catch (err) {
        showToast(err.message || t('toast.modpackCreateFailed'), 'error');
    }
});

async function redeemInvite(rawToken) {
    const token = extractInviteToken(rawToken);
    if (!token) return;
    try {
        const result = await window.electronAPI.redeemInvite(token);
        showToast(t('toast.inviteJoined', { name: result.modpack.name }), 'info');
        inviteLinkInput.value = '';
        loadModpacks();
    } catch (err) {
        showToast(err.message || t('toast.inviteRedeemFailed'), 'error');
    }
}

redeemInviteBtn.addEventListener('click', async () => {
    redeemInviteBtn.disabled = true;
    try {
        await redeemInvite(inviteLinkInput.value);
    } finally {
        redeemInviteBtn.disabled = false;
    }
});

// Cuando el sistema operativo abre un link milauncher://invite/TOKEN
window.electronAPI.onInviteReceived((data) => {
    showScreen('modpacksScreen');
    loadModpacks();
    redeemInvite(data.token);
});

async function selectAndSyncModpack(id, name, mcVersion, loader, loaderVersion, buttonEl) {
    const originalText = buttonEl.innerText;
    buttonEl.disabled = true;
    buttonEl.innerText = '...';

    const removeProgressListener = window.electronAPI.onModpackSyncProgress((data) => {
        if (data.modpackId === id) {
            buttonEl.innerText = `${data.percent}%`;
        }
    });

    try {
        const synced = await window.electronAPI.syncModpack(id);
        const resolvedLoaderVersion = (synced && synced.loader_version) || loaderVersion;
        await window.electronAPI.selectActiveModpack(id, name, mcVersion, loader, resolvedLoaderVersion);
        document.getElementById('mainScreen').dataset.modpackActive = '1';
        updateActiveModpackLabel({ name, mc_version: mcVersion, loader, loader_version: resolvedLoaderVersion });
        await applyTargetSettings(id);
        showToast(t('toast.modpackReady', { name }), 'info');
        showScreen('mainScreen');
    } catch (err) {
        showToast(err.message || t('toast.modpackSyncFailed'), 'error');
    } finally {
        removeProgressListener();
        buttonEl.disabled = false;
        buttonEl.innerText = originalText;
    }
}
