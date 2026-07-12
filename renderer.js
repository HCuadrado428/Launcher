const loginScreen = document.getElementById('loginScreen');
const mainScreen = document.getElementById('mainScreen');
const modpacksScreen = document.getElementById('modpacksScreen');

const languageSelect = document.getElementById('languageSelect');

const updateBanner = document.getElementById('updateBanner');
const updateBannerText = document.getElementById('updateBannerText');
const updateRestartBtn = document.getElementById('updateRestartBtn');
const updateModal = document.getElementById('updateModal');
const updatePopupMessage = document.getElementById('updatePopupMessage');
const updateYesBtn = document.getElementById('updateYesBtn');
const updateLaterBtn = document.getElementById('updateLaterBtn');
const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');

const offlineUsername = document.getElementById('offlineUsername');
const offlineLoginBtn = document.getElementById('offlineLoginBtn');
const msLoginBtn = document.getElementById('msLoginBtn');

const avatar = document.getElementById('avatar');
const accountName = document.getElementById('accountName');
const accountType = document.getElementById('accountType');
const switchAccountBtn = document.getElementById('switchAccountBtn');

const javaPathInput = document.getElementById('javaPath');
const browseBtn = document.getElementById('browseBtn');
const detectBtn = document.getElementById('detectBtn');
const javaHint = document.getElementById('javaHint');

const ramSlider = document.getElementById('ramSlider');
const ramValue = document.getElementById('ramValue');

const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const toastWrap = document.getElementById('toastWrap');

const activeModpackLabel = document.getElementById('activeModpackLabel');
const openModpacksBtn = document.getElementById('openModpacksBtn');
const backToMainBtn = document.getElementById('backToMainBtn');
const useVanillaBtn = document.getElementById('useVanillaBtn');

const inviteLinkInput = document.getElementById('inviteLinkInput');
const redeemInviteBtn = document.getElementById('redeemInviteBtn');
const newModpackName = document.getElementById('newModpackName');
const newModpackVersion = document.getElementById('newModpackVersion');
const newModpackLoader = document.getElementById('newModpackLoader');
const loaderVersionField = document.getElementById('loaderVersionField');
const newModpackLoaderVersion = document.getElementById('newModpackLoaderVersion');
const createModpackBtn = document.getElementById('createModpackBtn');
const ownedModpacksList = document.getElementById('ownedModpacksList');
const sharedModpacksList = document.getElementById('sharedModpacksList');

const openImportModalBtn = document.getElementById('openImportModalBtn');
const importModal = document.getElementById('importModal');
const closeImportModalBtn = document.getElementById('closeImportModalBtn');
const scanLocalModpacksBtn = document.getElementById('scanLocalModpacksBtn');
const importResults = document.getElementById('importResults');
const curseforgeApiKeyInput = document.getElementById('curseforgeApiKeyInput');
const saveCurseforgeApiKeyBtn = document.getElementById('saveCurseforgeApiKeyBtn');

const modsModal = document.getElementById('modsModal');
const modsModalTitle = document.getElementById('modsModalTitle');
const modsTypeTab = document.getElementById('modsTypeTab');
const resourcepacksTypeTab = document.getElementById('resourcepacksTypeTab');
const modsList = document.getElementById('modsList');
const addModBtn = document.getElementById('addModBtn');
const modrinthSearchInput = document.getElementById('modrinthSearchInput');
const modrinthSearchBtn = document.getElementById('modrinthSearchBtn');
const modrinthResults = document.getElementById('modrinthResults');
const closeModsModalBtn = document.getElementById('closeModsModalBtn');
const generateInviteBtn = document.getElementById('generateInviteBtn');
const inviteResultBox = document.getElementById('inviteResultBox');
const deleteModpackBtn = document.getElementById('deleteModpackBtn');

let currentAccount = null;
let currentModsModalId = null;
let currentModsModalName = null;
let currentModsModalMcVersion = null;
let currentModsModalLoader = null;

function showToast(message, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.innerText = message;
    toastWrap.appendChild(el);
    setTimeout(() => el.remove(), 5000);
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function renderAccount(account) {
    if (!account) return;
    currentAccount = account;
    accountName.innerText = account.username || '???';
    if (account.type === 'microsoft') {
        accountType.innerText = t('account.ms');
        if (account.uuid) {
            avatar.innerHTML = `<img src="https://crafatar.com/avatars/${account.uuid}?size=42&overlay" onerror="this.parentElement.innerText='${(account.username || '?')[0].toUpperCase()}'">`;
        } else {
            avatar.innerText = (account.username || '?')[0].toUpperCase();
        }
        openModpacksBtn.disabled = false;
    } else {
        accountType.innerText = t('account.offline');
        avatar.innerHTML = '';
        avatar.innerText = (account.username || '?')[0].toUpperCase();
        // Las cuentas offline no tienen identidad verificable en el servidor
        // de modpacks, así que no pueden crear ni unirse a ninguno.
        openModpacksBtn.disabled = true;
    }
}

// --- Idioma ---

let currentAppVersion = null;

languageSelect.addEventListener('change', () => {
    setLanguage(languageSelect.value);
    window.electronAPI.setLanguage(languageSelect.value);
    if (currentAppVersion) checkUpdatesBtn.innerText = t('app.checkUpdates', { version: currentAppVersion });
});

// --- Actualizaciones ---
// Ya no se descarga automáticamente al detectar una versión nueva: se
// muestra un popup preguntando si el usuario quiere descargarla ahora o más
// tarde. Como la comprobación se repite cada vez que se abre la app, si elige
// "más tarde" el popup volverá a salir la próxima vez que la abra.
// El instalador pesa ~100MB y no hay descarga diferencial entre versiones
// sin blockmap previo publicado, así que la descarga puede tardar. Mostramos
// el progreso real en vez de solo el aviso final, para que no parezca que no
// ha pasado nada mientras se descarga en segundo plano.

let manualUpdateCheckInFlight = false;
let pendingUpdateVersion = null;

window.electronAPI.onUpdateStatus((data) => {
    if (data.type === 'available') {
        manualUpdateCheckInFlight = false;
        pendingUpdateVersion = data.version;
        updatePopupMessage.innerText = t('update.popup.message', { version: data.version });
        updateModal.classList.add('active');
    } else if (data.type === 'not-available') {
        if (manualUpdateCheckInFlight) {
            manualUpdateCheckInFlight = false;
            showToast(t('update.upToDate'), 'info');
        }
    } else if (data.type === 'downloading') {
        updateModal.classList.remove('active');
        updateBannerText.innerText = t('update.downloadingPercent', { percent: data.percent });
        updateRestartBtn.style.display = 'none';
        updateBanner.classList.add('active');
    } else if (data.type === 'downloaded') {
        updateBannerText.innerText = t('update.downloaded', { version: data.version });
        updateRestartBtn.style.display = '';
        updateBanner.classList.add('active');
    } else if (data.type === 'error') {
        console.warn('Error de actualización:', data.message);
        if (manualUpdateCheckInFlight) {
            manualUpdateCheckInFlight = false;
            showToast(t('update.checkError'), 'error');
        }
    }
});

updateYesBtn.addEventListener('click', () => {
    updateModal.classList.remove('active');
    updateBannerText.innerText = t('update.downloading', { version: pendingUpdateVersion });
    updateRestartBtn.style.display = 'none';
    updateBanner.classList.add('active');
    window.electronAPI.downloadUpdate();
});

updateLaterBtn.addEventListener('click', () => {
    updateModal.classList.remove('active');
});

updateRestartBtn.addEventListener('click', () => {
    window.electronAPI.restartAndUpdate();
});

// Versión actual + comprobación manual (footer bajo el título).
window.electronAPI.getAppVersion().then((version) => {
    currentAppVersion = version;
    checkUpdatesBtn.innerText = t('app.checkUpdates', { version });
});

checkUpdatesBtn.addEventListener('click', async () => {
    // El resultado real (encontrada / no hay / error) llega por los eventos
    // 'available' / 'not-available' / 'error' de onUpdateStatus, que resetean
    // manualUpdateCheckInFlight antes de que se resuelva este await. Si sigue
    // en true al terminar, es que ningún evento respondió (modo desarrollo,
    // sin updater real): ahí usamos el resultado devuelto directamente.
    if (manualUpdateCheckInFlight) return;
    manualUpdateCheckInFlight = true;
    const result = await window.electronAPI.checkForUpdates();
    if (manualUpdateCheckInFlight) {
        manualUpdateCheckInFlight = false;
        if (!result.ok) showToast(result.message, 'error');
    }
});

// --- Login ---

offlineLoginBtn.addEventListener('click', async () => {
    const username = offlineUsername.value.trim() || 'Jugador';
    const account = await window.electronAPI.loginOffline(username);
    renderAccount(account);
    updateActiveModpackLabel(null);
    showScreen('mainScreen');
});

msLoginBtn.addEventListener('click', async () => {
    msLoginBtn.disabled = true;
    msLoginBtn.innerText = t('login.ms.opening');
    const result = await window.electronAPI.loginMicrosoft();
    msLoginBtn.disabled = false;
    msLoginBtn.innerText = t('login.ms.button');

    if (result && result.success) {
        renderAccount(result.account);
        showScreen('mainScreen');
        showToast(t('toast.loggedIn', { name: result.account.username }), 'info');
    } else {
        showToast((result && result.message) || t('toast.msLoginFailed'), 'error');
    }
});

switchAccountBtn.addEventListener('click', async () => {
    await window.electronAPI.logout();
    showScreen('loginScreen');
});

// --- Java ---

async function runAutoDetect(silent) {
    if (!silent) javaHint.innerText = t('toast.javaSearching');
    const detected = await window.electronAPI.autoDetectJava();
    if (detected) {
        javaPathInput.value = detected;
        javaHint.innerText = t('toast.javaDetected', { path: detected });
    } else if (!silent) {
        javaHint.innerText = t('toast.javaNotFound');
    }
    return detected;
}

detectBtn.addEventListener('click', () => runAutoDetect(false));

browseBtn.addEventListener('click', async () => {
    const selected = await window.electronAPI.selectJavaPath();
    if (selected) {
        javaPathInput.value = selected;
        javaHint.innerText = '';
    }
});

// --- RAM slider ---

ramSlider.addEventListener('input', () => {
    ramValue.innerText = ramSlider.value + ' GB';
});

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
});

backToMainBtn.addEventListener('click', () => showScreen('mainScreen'));

useVanillaBtn.addEventListener('click', async () => {
    await window.electronAPI.selectActiveModpack(null, null, null, null);
    document.getElementById('mainScreen').dataset.modpackActive = '';
    updateActiveModpackLabel(null);
    showToast(t('toast.vanillaSelected'), 'info');
    showScreen('mainScreen');
});

// --- Carga inicial ---

window.electronAPI.getConfig().then(async (cfg) => {
    const lang = (cfg && cfg.language) || 'es';
    languageSelect.value = lang;
    setLanguage(lang);

    if (cfg && cfg.account) {
        renderAccount(cfg.account);
        showScreen('mainScreen');
    } else {
        showScreen('loginScreen');
    }

    if (cfg && cfg.javaPath) {
        javaPathInput.value = cfg.javaPath;
    } else {
        await runAutoDetect(true);
    }

    if (cfg && cfg.curseforgeApiKey) {
        curseforgeApiKeyInput.value = cfg.curseforgeApiKey;
    }

    if (cfg && cfg.memory && cfg.memory.max) {
        const gb = parseInt(cfg.memory.max, 10);
        if (!isNaN(gb)) {
            ramSlider.value = gb;
            ramValue.innerText = gb + ' GB';
        }
    }

    if (cfg && cfg.activeModpack) {
        document.getElementById('mainScreen').dataset.modpackActive = '1';
        updateActiveModpackLabel(cfg.activeModpack);
    } else {
        updateActiveModpackLabel(null);
    }
});

// --- Jugar / detener ---

playBtn.addEventListener('click', () => {
    const javaPath = javaPathInput.value;
    const maxGb = parseInt(ramSlider.value, 10);
    const minGb = Math.max(1, Math.round(maxGb / 2));

    window.electronAPI.launchGame({
        javaPath,
        memory: { max: maxGb + 'G', min: minGb + 'G' }
    });

    playBtn.innerText = t('main.playStarting');
    playBtn.disabled = true;
    stopBtn.disabled = false;

    progressWrap.style.display = 'block';
    progressFill.style.width = '0%';
    progressLabel.innerText = t('main.progress.preparing');
});

stopBtn.addEventListener('click', () => {
    window.electronAPI.stopGame();
});

function resetToIdle() {
    playBtn.innerText = t('main.play');
    playBtn.disabled = false;
    stopBtn.disabled = true;
    progressWrap.style.display = 'none';
}

window.electronAPI.onGameStatus((data) => {
    if (data.type === 'version-selected') {
        // No pisamos la etiqueta de instalación activa; solo informativo.
    } else if (data.type === 'error') {
        showToast(data.message, 'error');
        resetToIdle();
    } else if (data.type === 'modpack-removed') {
        showToast(data.message, 'error');
        document.getElementById('mainScreen').dataset.modpackActive = '';
        updateActiveModpackLabel(null);
        resetToIdle();
    } else if (data.type === 'launched') {
        playBtn.innerText = t('main.playStarted');
        progressWrap.style.display = 'none';
    } else if (data.type === 'closed' || data.type === 'stopped') {
        resetToIdle();
    }
});

// minecraft-launcher-core emite dos tipos de evento de progreso distintos y
// NO hay que tratarlos igual:
//  - "progress" trae { type, task, total } -> progreso ESTABLE por categoría.
//    Siempre avanza hacia adelante. Esta es la que mueve la barra.
//  - "download-status" trae { name, type, current, total } -> progreso de UN
//    archivo individual. Se resetea a 0 en cada archivo nuevo, así que solo
//    la usamos para mostrar qué archivo se está descargando ahora mismo.
window.electronAPI.onGameProgress((data) => {
    progressWrap.style.display = 'block';

    if (data.task !== undefined) {
        const total = data.total || 0;
        const percent = total > 0 ? Math.min(100, Math.round((data.task / total) * 100)) : 0;
        progressFill.style.width = percent + '%';
        progressLabel.innerText = `${data.type || t('main.progress.preparing')}... ${percent}%`;
    } else if (data.current !== undefined) {
        const fileName = data.name ? data.name.split(/[\\/]/).pop() : (data.type || 'archivo');
        progressLabel.innerText = `${fileName}...`;
    }
});

// ============================================================================
// MODPACKS
// ============================================================================

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

const LOADER_LABELS = { forge: 'Forge', fabric: 'Fabric' };
const LOADER_ICONS = { forge: '🛠️', fabric: '🧵' };

function loaderBadgeHtml(loader, loaderVersion) {
    if (!loader || loader === 'vanilla') return '';
    const label = LOADER_LABELS[loader] || loader;
    const text = loaderVersion ? `${label} ${loaderVersion}` : label;
    return `<span class="badge badge-${loader}">${escapeHtml(text)}</span>`;
}

function modpackItemHtml(pack, isOwner) {
    const icon = LOADER_ICONS[pack.loader] || '📦';
    return `
        <div class="modpack-card" data-id="${pack.id}">
            <div class="modpack-card-icon">${icon}</div>
            <div class="modpack-card-info">
                <div class="modpack-card-name">${escapeHtml(pack.name)} ${loaderBadgeHtml(pack.loader, pack.loader_version)}</div>
                <div class="modpack-card-meta">MC ${escapeHtml(pack.mc_version)}${isOwner ? t('modpacks.owner.suffix') : ''}</div>
            </div>
            <div class="modpack-card-actions">
                ${isOwner ? `<button class="secondary manage-btn" data-id="${pack.id}" data-name="${escapeHtml(pack.name)}" data-version="${escapeHtml(pack.mc_version)}" data-loader="${escapeHtml(pack.loader || 'vanilla')}">${t('modpacks.manage')}</button>` : ''}
                <button class="select-btn" data-id="${pack.id}" data-name="${escapeHtml(pack.name)}" data-version="${escapeHtml(pack.mc_version)}" data-loader="${escapeHtml(pack.loader || 'vanilla')}" data-loader-version="${escapeHtml(pack.loader_version || '')}">${t('modpacks.play')}</button>
            </div>
        </div>
    `;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = str == null ? '' : String(str);
    return div.innerHTML;
}

let lastLoadedModpacks = { owned: [], shared: [] };

async function loadModpacks() {
    ownedModpacksList.innerHTML = `<div class="empty-hint">${t('common.loading')}</div>`;
    sharedModpacksList.innerHTML = `<div class="empty-hint">${t('common.loading')}</div>`;
    try {
        const data = await window.electronAPI.getMyModpacks();
        lastLoadedModpacks = data;

        ownedModpacksList.innerHTML = data.owned.length
            ? data.owned.map(p => modpackItemHtml(p, true)).join('')
            : `<div class="empty-hint">${t('modpacks.empty.owned')}</div>`;

        sharedModpacksList.innerHTML = data.shared.length
            ? data.shared.map(p => modpackItemHtml(p, false)).join('')
            : `<div class="empty-hint">${t('modpacks.empty.shared')}</div>`;

        document.querySelectorAll('.manage-btn').forEach(btn => {
            btn.addEventListener('click', () => openModsModal(btn.dataset.id, btn.dataset.name, btn.dataset.version, btn.dataset.loader));
        });
        document.querySelectorAll('.select-btn').forEach(btn => {
            btn.addEventListener('click', () => selectAndSyncModpack(btn.dataset.id, btn.dataset.name, btn.dataset.version, btn.dataset.loader, btn.dataset.loaderVersion, btn));
        });

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

function extractInviteToken(raw) {
    const value = raw.trim();
    const match = /^milauncher:\/\/invite\/(.+)$/.exec(value);
    return match ? match[1] : value; // si no es un link completo, asumimos que ya es el token
}

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

redeemInviteBtn.addEventListener('click', () => redeemInvite(inviteLinkInput.value));

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
        showToast(t('toast.modpackReady', { name }), 'info');
        showScreen('mainScreen');
    } catch (err) {
        showToast(err.message || t('toast.modpackSyncFailed'), 'error');
    } finally {
        buttonEl.disabled = false;
        buttonEl.innerText = originalText;
    }
}

// --- Modal de gestión de mods ---

let currentModsModalType = 'mod';
let currentManifestMods = [];

async function openModsModal(id, name, mcVersion, loader) {
    currentModsModalId = id;
    currentModsModalName = name;
    currentModsModalMcVersion = mcVersion;
    currentModsModalLoader = loader;
    currentModsModalType = 'mod';
    modsTypeTab.classList.add('active');
    resourcepacksTypeTab.classList.remove('active');
    addModBtn.innerText = t('modal.addMod');
    modsModalTitle.innerText = `${t('modal.title')} · ${name}`;
    inviteResultBox.classList.remove('active');
    inviteResultBox.innerText = '';
    modrinthSearchInput.value = '';
    modrinthResults.innerHTML = '';
    modsModal.classList.add('active');
    await reloadModsList();
}

function renderModsList() {
    const filtered = currentManifestMods.filter(mod => (mod.type || 'mod') === currentModsModalType);
    const emptyKey = currentModsModalType === 'resourcepack' ? 'modal.resourcepacks.empty' : 'modal.mods.empty';
    modsList.innerHTML = filtered.length
        ? filtered.map(mod => `
            <div class="mod-item" data-mod-id="${mod.id}">
                <span>${escapeHtml(mod.filename)}</span>
                <button class="mod-item-remove" data-mod-id="${mod.id}" title="Quitar">&times;</button>
            </div>
        `).join('')
        : `<div class="empty-hint">${t(emptyKey)}</div>`;

    modsList.querySelectorAll('.mod-item-remove').forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                await window.electronAPI.removeModFromModpack(currentModsModalId, btn.dataset.modId);
                showToast(t('toast.modRemoved'), 'info');
                await reloadModsList();
            } catch (err) {
                showToast(err.message || t('toast.modRemoveFailed'), 'error');
            }
        });
    });
}

async function reloadModsList() {
    if (!currentModsModalId) return;
    modsList.innerHTML = `<div class="empty-hint">${t('common.loading')}</div>`;
    try {
        const manifest = await window.electronAPI.getModpackManifest(currentModsModalId);
        currentManifestMods = manifest.mods;
        renderModsList();
    } catch (err) {
        modsList.innerHTML = '';
        showToast(err.message || t('toast.modpackManifestLoadFailed'), 'error');
    }
}

function selectModsModalType(type) {
    currentModsModalType = type;
    modsTypeTab.classList.toggle('active', type === 'mod');
    resourcepacksTypeTab.classList.toggle('active', type === 'resourcepack');
    addModBtn.innerText = type === 'resourcepack' ? t('modal.addResourcePack') : t('modal.addMod');
    modrinthResults.innerHTML = '';
    renderModsList();
}

modsTypeTab.addEventListener('click', () => selectModsModalType('mod'));
resourcepacksTypeTab.addEventListener('click', () => selectModsModalType('resourcepack'));

addModBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;
    const uploadingText = t('modal.addModUploading');
    addModBtn.disabled = true;
    addModBtn.innerText = uploadingText;
    try {
        const result = await window.electronAPI.addModToModpack(currentModsModalId, currentModsModalType);
        if (!result.cancelled) {
            showToast(t('toast.modsUploaded', { count: result.uploaded.length }), 'info');
            await reloadModsList();
        }
    } catch (err) {
        showToast(err.message || t('toast.modUploadFailed'), 'error');
    } finally {
        addModBtn.disabled = false;
        addModBtn.innerText = currentModsModalType === 'resourcepack' ? t('modal.addResourcePack') : t('modal.addMod');
    }
});

// --- Buscador de Modrinth ---

function modrinthResultHtml(hit) {
    const icon = hit.icon_url
        ? `<img class="modrinth-result-icon" src="${escapeHtml(hit.icon_url)}" alt="">`
        : `<div class="modrinth-result-icon"></div>`;
    return `
        <div class="modrinth-result-item" data-project-id="${escapeHtml(hit.project_id)}">
            ${icon}
            <div class="modrinth-result-info">
                <div class="modrinth-result-title">${escapeHtml(hit.title)}</div>
                <div class="modrinth-result-meta">${escapeHtml(hit.author)} · ${hit.downloads.toLocaleString()} ${t('modal.modrinth.downloads')}</div>
            </div>
            <button class="secondary modrinth-add-btn" data-project-id="${escapeHtml(hit.project_id)}">${t('modal.modrinth.add')}</button>
        </div>
    `;
}

async function runModrinthSearch() {
    if (!currentModsModalId) return;
    modrinthSearchBtn.disabled = true;
    modrinthResults.innerHTML = `<div class="empty-hint">${t('common.loading')}</div>`;
    try {
        const hits = await window.electronAPI.searchModrinth(
            modrinthSearchInput.value.trim(),
            currentModsModalMcVersion,
            currentModsModalLoader,
            currentModsModalType
        );
        modrinthResults.innerHTML = hits.length
            ? hits.map(modrinthResultHtml).join('')
            : `<div class="empty-hint">${t('modal.modrinth.empty')}</div>`;

        modrinthResults.querySelectorAll('.modrinth-add-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const originalText = btn.innerText;
                btn.disabled = true;
                btn.innerText = '...';
                try {
                    await window.electronAPI.addModFromModrinth(
                        currentModsModalId,
                        btn.dataset.projectId,
                        currentModsModalMcVersion,
                        currentModsModalLoader,
                        currentModsModalType
                    );
                    showToast(t('toast.modrinthAdded'), 'info');
                    await reloadModsList();
                } catch (err) {
                    showToast(err.message || t('toast.modrinthAddFailed'), 'error');
                } finally {
                    btn.disabled = false;
                    btn.innerText = originalText;
                }
            });
        });
    } catch (err) {
        modrinthResults.innerHTML = '';
        showToast(err.message || t('toast.modrinthSearchFailed'), 'error');
    } finally {
        modrinthSearchBtn.disabled = false;
    }
}

modrinthSearchBtn.addEventListener('click', runModrinthSearch);
modrinthSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runModrinthSearch();
});

closeModsModalBtn.addEventListener('click', () => {
    modsModal.classList.remove('active');
    currentModsModalId = null;
    currentModsModalName = null;
    loadModpacks();
});

generateInviteBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;
    try {
        const result = await window.electronAPI.createInvite(currentModsModalId);
        inviteResultBox.innerText = result.url;
        inviteResultBox.classList.add('active');
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(result.url);
            showToast(t('toast.inviteCopied'), 'info');
        }
    } catch (err) {
        showToast(err.message || t('toast.inviteCreateFailed'), 'error');
    }
});

deleteModpackBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;
    const confirmed = confirm(t('modal.deleteConfirm', { name: currentModsModalName || '' }));
    if (!confirmed) return;

    deleteModpackBtn.disabled = true;
    deleteModpackBtn.innerText = t('modal.deleting');
    try {
        await window.electronAPI.deleteModpack(currentModsModalId);
        showToast(t('toast.modpackDeleted'), 'info');
        modsModal.classList.remove('active');
        currentModsModalId = null;
        currentModsModalName = null;
        loadModpacks();
    } catch (err) {
        showToast(err.message || t('toast.modpackDeleteFailed'), 'error');
    } finally {
        deleteModpackBtn.disabled = false;
        deleteModpackBtn.innerText = t('modal.deleteModpack');
    }
});

// ============================================================================
// IMPORTAR MODPACK LOCAL (CurseForge App / Modrinth App)
// ============================================================================

const SOURCE_ICONS = { curseforge: '🟠', modrinth: '🟢' };
const SOURCE_LABELS = { curseforge: 'CurseForge', modrinth: 'Modrinth' };

openImportModalBtn.addEventListener('click', () => {
    importModal.classList.add('active');
    importResults.innerHTML = '';
});

closeImportModalBtn.addEventListener('click', () => {
    importModal.classList.remove('active');
    loadModpacks();
});

function importItemHtml(instance) {
    const icon = SOURCE_ICONS[instance.source] || '📦';
    const sourceLabel = SOURCE_LABELS[instance.source] || instance.source;
    let meta;
    let actionHtml;
    if (instance.source === 'curseforge') {
        meta = `${sourceLabel} · ${t('import.curseforge.needsKey')}`;
        actionHtml = '';
    } else {
        meta = instance.mcVersion
            ? `${sourceLabel} · MC ${escapeHtml(instance.mcVersion)}${instance.loader ? ' · ' + escapeHtml(instance.loader) : ''} · ${instance.resolvedCount}/${instance.modCount} ${t('import.mods.identified')}`
            : `${sourceLabel} · ${t('import.mods.unresolved')}`;
        actionHtml = instance.importable
            ? `<button class="import-btn" data-path="${escapeHtml(instance.path)}">${t('import.button')}</button>`
            : '';
    }
    const isUnavailable = instance.source === 'curseforge' || !instance.importable;
    return `
        <div class="import-item ${isUnavailable ? 'unavailable' : ''}">
            <div class="import-item-icon">${icon}</div>
            <div class="import-item-info">
                <div class="import-item-name">${escapeHtml(instance.name)}</div>
                <div class="import-item-meta">${meta}</div>
            </div>
            ${actionHtml}
        </div>
    `;
}

scanLocalModpacksBtn.addEventListener('click', async () => {
    scanLocalModpacksBtn.disabled = true;
    scanLocalModpacksBtn.innerText = t('common.loading');
    importResults.innerHTML = '';
    try {
        const instances = await window.electronAPI.scanLocalModpacks();
        importResults.innerHTML = instances.length
            ? instances.map(importItemHtml).join('')
            : `<div class="empty-hint">${t('import.empty')}</div>`;

        importResults.querySelectorAll('.import-btn').forEach(btn => {
            btn.addEventListener('click', () => importLocalModpack(btn.dataset.path, btn));
        });
    } catch (err) {
        importResults.innerHTML = '';
        showToast(err.message || t('import.scanFailed'), 'error');
    } finally {
        scanLocalModpacksBtn.disabled = false;
        scanLocalModpacksBtn.innerText = t('import.scan');
    }
});

async function importLocalModpack(instancePath, buttonEl) {
    const originalText = buttonEl.innerText;
    buttonEl.disabled = true;
    buttonEl.innerText = '...';

    const removeProgressListener = window.electronAPI.onModpackSyncProgress((data) => {
        buttonEl.innerText = `${data.percent}%`;
    });

    try {
        const result = await window.electronAPI.importLocalModpack(instancePath);
        let message = t('import.success', { name: result.modpack.name, count: result.imported });
        if (result.skipped > 0 || result.unresolvedCount > 0) {
            message += ' ' + t('import.partial', { count: result.skipped + result.unresolvedCount });
        }
        showToast(message, 'info');
        importModal.classList.remove('active');
        loadModpacks();
    } catch (err) {
        showToast(err.message || t('import.failed'), 'error');
        buttonEl.disabled = false;
        buttonEl.innerText = originalText;
    }
}

saveCurseforgeApiKeyBtn.addEventListener('click', async () => {
    await window.electronAPI.setCurseForgeApiKey(curseforgeApiKeyInput.value.trim());
    showToast(t('import.curseforgeKey.saved'), 'info');
});
