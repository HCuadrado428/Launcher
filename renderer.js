const loginScreen = document.getElementById('loginScreen');
const mainScreen = document.getElementById('mainScreen');
const modpacksScreen = document.getElementById('modpacksScreen');

// --- Fondo de chispas/ascuas ---
// Puramente decorativo: unas cuantas motas subiendo lentamente de fondo, a
// juego con el nombre "Ember Launcher". Solo transform/opacity (acelerado
// por GPU) y respeta prefers-reduced-motion vía CSS.
(function initEmberParticles() {
    const container = document.getElementById('emberParticles');
    const COUNT = 22;
    for (let i = 0; i < COUNT; i++) {
        const particle = document.createElement('span');
        particle.className = 'ember-particle';
        const size = 3 + Math.random() * 5;
        particle.style.left = Math.random() * 100 + '%';
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.setProperty('--ember-drift', (Math.random() * 80 - 40) + 'px');
        particle.style.animationDuration = (9 + Math.random() * 10) + 's';
        particle.style.animationDelay = (Math.random() * -20) + 's';
        container.appendChild(particle);
    }
})();

const languageSelect = document.getElementById('languageSelect');
const themeSwitcher = document.getElementById('themeSwitcher');
const themeSwatches = document.querySelectorAll('.theme-swatch');

const updateBanner = document.getElementById('updateBanner');
const updateBannerText = document.getElementById('updateBannerText');
const updateRestartBtn = document.getElementById('updateRestartBtn');
const updateModal = document.getElementById('updateModal');
const updatePopupMessage = document.getElementById('updatePopupMessage');
const updatePopupNotes = document.getElementById('updatePopupNotes');
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

const accountsModal = document.getElementById('accountsModal');
const accountsList = document.getElementById('accountsList');
const closeAccountsModalBtn = document.getElementById('closeAccountsModalBtn');
const addOfflineAccountBtn = document.getElementById('addOfflineAccountBtn');
const addMicrosoftAccountBtn = document.getElementById('addMicrosoftAccountBtn');

const javaPathInput = document.getElementById('javaPath');
const browseBtn = document.getElementById('browseBtn');
const detectBtn = document.getElementById('detectBtn');
const javaHint = document.getElementById('javaHint');

const ramSlider = document.getElementById('ramSlider');
const ramValue = document.getElementById('ramValue');
const ramHint = document.getElementById('ramHint');
const customJvmArgsInput = document.getElementById('customJvmArgsInput');

const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const openConsoleBtn = document.getElementById('openConsoleBtn');
const consoleModal = document.getElementById('consoleModal');
const consoleLogBox = document.getElementById('consoleLogBox');
const closeConsoleModalBtn = document.getElementById('closeConsoleModalBtn');
const copyLogBtn = document.getElementById('copyLogBtn');
const clearLogBtn = document.getElementById('clearLogBtn');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const toastWrap = document.getElementById('toastWrap');

const activeModpackLabel = document.getElementById('activeModpackLabel');
const playtimeLabel = document.getElementById('playtimeLabel');
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
const modpackSearchInput = document.getElementById('modpackSearchInput');
const backendStatusDot = document.getElementById('backendStatusDot');
const backendStatusText = document.getElementById('backendStatusText');

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
const repairModpackBtn = document.getElementById('repairModpackBtn');
const verifyModpackBtn = document.getElementById('verifyModpackBtn');
const exportModpackBtn = document.getElementById('exportModpackBtn');
const setCoverBtn = document.getElementById('setCoverBtn');

let currentAccount = null;
let currentModsModalId = null;
let currentModsModalName = null;
let currentModsModalMcVersion = null;
let currentModsModalLoader = null;

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = -1;
    do {
        value /= 1024;
        unitIndex++;
    } while (value >= 1024 && unitIndex < units.length - 1);
    return `${value.toFixed(1)} ${units[unitIndex]}`;
}

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
            const fallbackLetter = (account.username || '?')[0].toUpperCase();
            avatar.classList.remove('avatar-render');
            avatar.innerText = fallbackLetter;
            // Se pide por IPC (no <img src> directo) porque Visage, el
            // respaldo si Crafatar está caído, exige una cabecera
            // User-Agent propia que un <img> normal no puede mandar.
            window.electronAPI.getSkinRender(account.uuid).then((dataUri) => {
                if (!dataUri || currentAccount !== account) return;
                avatar.classList.add('avatar-render');
                avatar.innerHTML = `<img src="${dataUri}" alt="">`;
            });
        } else {
            avatar.classList.remove('avatar-render');
            avatar.innerText = (account.username || '?')[0].toUpperCase();
        }
        openModpacksBtn.disabled = false;
    } else {
        accountType.innerText = t('account.offline');
        avatar.classList.remove('avatar-render');
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

// --- Tema de color ---

function applyColorTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeSwatches.forEach((swatch) => {
        swatch.classList.toggle('active', swatch.dataset.theme === theme);
    });
}

themeSwitcher.addEventListener('click', (e) => {
    const swatch = e.target.closest('.theme-swatch');
    if (!swatch) return;
    applyColorTheme(swatch.dataset.theme);
    window.electronAPI.setColorTheme(swatch.dataset.theme);
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
        if (data.releaseNotes) {
            updatePopupNotes.innerText = data.releaseNotes;
            updatePopupNotes.style.display = '';
        } else {
            updatePopupNotes.style.display = 'none';
        }
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

// --- Multi-cuenta ---

async function renderAccountsList() {
    const accounts = await window.electronAPI.getAccounts();
    if (accounts.length === 0) {
        accountsList.innerHTML = `<div class="empty-hint">${t('accounts.empty')}</div>`;
        return;
    }
    accountsList.innerHTML = accounts.map((a) => `
        <div class="account-row ${currentAccount && currentAccount.id === a.id ? 'active' : ''}" data-id="${a.id}">
            <div class="account-row-info">
                <div class="account-row-name">${a.username}</div>
                <div class="account-row-type">${a.type === 'microsoft' ? t('account.ms') : t('account.offline')}</div>
            </div>
            <button class="secondary use-account-btn" data-id="${a.id}" ${currentAccount && currentAccount.id === a.id ? 'disabled' : ''}>${t('accounts.use')}</button>
            <button class="danger remove-account-btn" data-id="${a.id}">${t('accounts.remove')}</button>
        </div>
    `).join('');
}

switchAccountBtn.addEventListener('click', async () => {
    await renderAccountsList();
    accountsModal.classList.add('active');
});

closeAccountsModalBtn.addEventListener('click', () => {
    accountsModal.classList.remove('active');
});

accountsList.addEventListener('click', async (e) => {
    const useBtn = e.target.closest('.use-account-btn');
    const removeBtn = e.target.closest('.remove-account-btn');

    if (useBtn) {
        try {
            const account = await window.electronAPI.switchAccount(useBtn.dataset.id);
            renderAccount(account);
            document.getElementById('mainScreen').dataset.modpackActive = '';
            updateActiveModpackLabel(null);
            await applyTargetSettings(null);
            accountsModal.classList.remove('active');
            showScreen('mainScreen');
            showToast(t('toast.loggedIn', { name: account.username }), 'info');
        } catch (err) {
            showToast(err.message || t('accounts.switchFailed'), 'error');
        }
    } else if (removeBtn) {
        const confirmed = confirm(t('accounts.removeConfirm'));
        if (!confirmed) return;
        const result = await window.electronAPI.removeAccount(removeBtn.dataset.id);
        if (result.removedActive) {
            currentAccount = null;
            accountsModal.classList.remove('active');
            showScreen('loginScreen');
        } else {
            await renderAccountsList();
        }
    }
});

addOfflineAccountBtn.addEventListener('click', () => {
    accountsModal.classList.remove('active');
    showScreen('loginScreen');
});

addMicrosoftAccountBtn.addEventListener('click', () => {
    accountsModal.classList.remove('active');
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

// La RAM y la ruta de Java se guardan por modpack (o para "vanilla" si no
// hay ninguno activo), así que hay que refrescar estos campos cada vez que
// cambia la instalación activa: un modpack pesado puede necesitar más RAM
// que vanilla, o un Java distinto si usa un loader antiguo.
async function applyTargetSettings(modpackId) {
    const settings = await window.electronAPI.getTargetSettings(modpackId);

    if (settings && settings.javaPath) {
        javaPathInput.value = settings.javaPath;
    } else {
        javaPathInput.value = '';
        await runAutoDetect(true);
    }

    if (settings && settings.memory && settings.memory.max) {
        const gb = parseInt(settings.memory.max, 10);
        ramSlider.value = isNaN(gb) ? 4 : gb;
    } else {
        ramSlider.value = 4;
    }
    ramValue.innerText = ramSlider.value + ' GB';
    updateRamHint();

    customJvmArgsInput.value = (settings && settings.customArgs) || '';
    updatePlaytimeLabel(modpackId);
}

// --- Horas jugadas ---

function formatPlaytime(totalMinutes) {
    const rounded = Math.round(totalMinutes);
    if (rounded < 1) return '';
    const hours = Math.floor(rounded / 60);
    const minutes = rounded % 60;
    return t('main.playtime', { hours, minutes });
}

async function updatePlaytimeLabel(modpackId) {
    const minutes = await window.electronAPI.getPlaytime(modpackId);
    playtimeLabel.innerText = formatPlaytime(minutes);
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
// Asignar más RAM de la que hay físicamente instalada no la "crea" de la
// nada: Java falla al arrancar (o el sistema entero se ralentiza muchísimo
// usando memoria virtual). Avisamos con un hint junto al slider en vez de
// dejar que se entere por un crash confuso.

let systemRamGb = null;

window.electronAPI.getSystemMemory().then((bytes) => {
    systemRamGb = Math.round(bytes / (1024 ** 3));
});

function updateRamHint() {
    if (!systemRamGb) return;
    const selected = parseInt(ramSlider.value, 10);
    if (selected > systemRamGb) {
        ramHint.innerText = t('main.ram.tooMuch', { total: systemRamGb });
        ramHint.classList.add('hint-warning');
    } else {
        ramHint.innerText = '';
        ramHint.classList.remove('hint-warning');
    }
}

ramSlider.addEventListener('input', () => {
    ramValue.innerText = ramSlider.value + ' GB';
    updateRamHint();
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

// --- Carga inicial ---

window.electronAPI.getConfig().then(async (cfg) => {
    const lang = (cfg && cfg.language) || 'es';
    languageSelect.value = lang;
    setLanguage(lang);
    applyColorTheme((cfg && cfg.colorTheme) || 'ember');

    if (cfg && cfg.account) {
        renderAccount(cfg.account);
        showScreen('mainScreen');
    } else {
        showScreen('loginScreen');
    }

    if (cfg && cfg.curseforgeApiKey) {
        curseforgeApiKeyInput.value = cfg.curseforgeApiKey;
    }

    if (cfg && cfg.activeModpack) {
        document.getElementById('mainScreen').dataset.modpackActive = '1';
        updateActiveModpackLabel(cfg.activeModpack);
    } else {
        updateActiveModpackLabel(null);
    }

    await applyTargetSettings(cfg && cfg.activeModpack ? cfg.activeModpack.id : null);
});

// --- Jugar / detener ---

playBtn.addEventListener('click', () => {
    const javaPath = javaPathInput.value;
    const maxGb = parseInt(ramSlider.value, 10);
    const minGb = Math.max(1, Math.round(maxGb / 2));

    window.electronAPI.launchGame({
        javaPath,
        memory: { max: maxGb + 'G', min: minGb + 'G' },
        customArgs: customJvmArgsInput.value
    });

    playBtn.innerText = t('main.playStarting');
    playBtn.disabled = true;
    stopBtn.disabled = false;

    progressWrap.style.display = 'block';
    progressFill.style.width = '0%';
    progressLabel.innerText = t('main.progress.preparing');

    gameLogLines = [];
    consoleLogBox.innerText = '';
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
    } else if (data.type === 'java-warning') {
        showToast(data.message, 'warning');
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
        window.electronAPI.getConfig().then((cfg) => {
            updatePlaytimeLabel(cfg && cfg.activeModpack ? cfg.activeModpack.id : null);
        });
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

// --- Consola del juego ---
// Se guarda un buffer aparte del DOM (limitado a 2000 líneas) para no perder
// nada aunque el modal esté cerrado mientras el juego escribe en su salida.

const GAME_LOG_MAX_LINES = 2000;
let gameLogLines = [];

window.electronAPI.onGameLog((line) => {
    gameLogLines.push(line);
    if (gameLogLines.length > GAME_LOG_MAX_LINES) {
        gameLogLines.splice(0, gameLogLines.length - GAME_LOG_MAX_LINES);
    }
    if (consoleModal.classList.contains('active')) {
        consoleLogBox.innerText = gameLogLines.join('');
        consoleLogBox.scrollTop = consoleLogBox.scrollHeight;
    }
});

openConsoleBtn.addEventListener('click', () => {
    consoleLogBox.innerText = gameLogLines.join('');
    consoleModal.classList.add('active');
    consoleLogBox.scrollTop = consoleLogBox.scrollHeight;
});

closeConsoleModalBtn.addEventListener('click', () => {
    consoleModal.classList.remove('active');
});

copyLogBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(gameLogLines.join(''));
        showToast(t('console.copied'), 'info');
    } catch (err) {
        showToast(t('console.copyError'), 'error');
    }
});

clearLogBtn.addEventListener('click', () => {
    gameLogLines = [];
    consoleLogBox.innerText = '';
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
        btn.addEventListener('click', () => openModsModal(btn.dataset.id, btn.dataset.name, btn.dataset.version, btn.dataset.loader));
    });
    document.querySelectorAll('.select-btn').forEach(btn => {
        btn.addEventListener('click', () => selectAndSyncModpack(btn.dataset.id, btn.dataset.name, btn.dataset.version, btn.dataset.loader, btn.dataset.loaderVersion, btn));
    });
}

modpackSearchInput.addEventListener('input', renderModpackLists);

function skeletonCardsHtml(count) {
    return Array.from({ length: count }, () => '<div class="modpack-card-skeleton"></div>').join('');
}

async function loadModpacks() {
    ownedModpacksList.innerHTML = skeletonCardsHtml(2);
    sharedModpacksList.innerHTML = skeletonCardsHtml(2);
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
        await applyTargetSettings(id);
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

repairModpackBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;
    const confirmed = confirm(t('modal.repairConfirm', { name: currentModsModalName || '' }));
    if (!confirmed) return;

    repairModpackBtn.disabled = true;
    const originalText = repairModpackBtn.innerText;

    window.electronAPI.onModpackSyncProgress((data) => {
        if (data.modpackId === currentModsModalId) {
            repairModpackBtn.innerText = `${data.label || ''} ${data.percent}%`;
        }
    });

    try {
        await window.electronAPI.repairModpack(currentModsModalId);
        showToast(t('toast.modpackRepaired'), 'info');
    } catch (err) {
        showToast(err.message || t('toast.modpackRepairFailed'), 'error');
    } finally {
        repairModpackBtn.disabled = false;
        repairModpackBtn.innerText = originalText;
    }
});

setCoverBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;
    setCoverBtn.disabled = true;
    try {
        const result = await window.electronAPI.setModpackCover(currentModsModalId);
        if (!result.cancelled) {
            showToast(t('toast.coverUpdated'), 'info');
        }
    } catch (err) {
        showToast(err.message || t('toast.coverUpdateFailed'), 'error');
    } finally {
        setCoverBtn.disabled = false;
    }
});

verifyModpackBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;

    verifyModpackBtn.disabled = true;
    const originalText = verifyModpackBtn.innerText;

    window.electronAPI.onModpackSyncProgress((data) => {
        if (data.modpackId === currentModsModalId) {
            verifyModpackBtn.innerText = `${data.label || ''} ${data.percent}%`;
        }
    });

    try {
        const result = await window.electronAPI.verifyModpackFiles(currentModsModalId);
        showToast(t('toast.modpackVerified', { checked: result.checked, fixed: result.fixed }), 'info');
    } catch (err) {
        showToast(err.message || t('toast.modpackVerifyFailed'), 'error');
    } finally {
        verifyModpackBtn.disabled = false;
        verifyModpackBtn.innerText = originalText;
    }
});

exportModpackBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;

    exportModpackBtn.disabled = true;
    try {
        const result = await window.electronAPI.exportModpack(currentModsModalId, currentModsModalName);
        if (!result.cancelled) {
            showToast(t('toast.modpackExported', { count: result.fileCount }), 'info');
        }
    } catch (err) {
        showToast(err.message || t('toast.modpackExportFailed'), 'error');
    } finally {
        exportModpackBtn.disabled = false;
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
