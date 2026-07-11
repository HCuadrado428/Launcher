const loginScreen = document.getElementById('loginScreen');
const mainScreen = document.getElementById('mainScreen');
const modpacksScreen = document.getElementById('modpacksScreen');

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
const createModpackBtn = document.getElementById('createModpackBtn');
const ownedModpacksList = document.getElementById('ownedModpacksList');
const sharedModpacksList = document.getElementById('sharedModpacksList');

const modsModal = document.getElementById('modsModal');
const modsModalTitle = document.getElementById('modsModalTitle');
const modsList = document.getElementById('modsList');
const addModBtn = document.getElementById('addModBtn');
const closeModsModalBtn = document.getElementById('closeModsModalBtn');
const generateInviteBtn = document.getElementById('generateInviteBtn');
const inviteResultBox = document.getElementById('inviteResultBox');

let currentAccount = null;
let currentModsModalId = null;

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
        accountType.innerText = 'Cuenta Microsoft';
        if (account.uuid) {
            avatar.innerHTML = `<img src="https://crafatar.com/avatars/${account.uuid}?size=42&overlay" onerror="this.parentElement.innerText='${(account.username || '?')[0].toUpperCase()}'">`;
        } else {
            avatar.innerText = (account.username || '?')[0].toUpperCase();
        }
        openModpacksBtn.disabled = false;
    } else {
        accountType.innerText = 'Cuenta no premium (offline)';
        avatar.innerHTML = '';
        avatar.innerText = (account.username || '?')[0].toUpperCase();
        // Las cuentas offline no tienen identidad verificable en el servidor
        // de modpacks, así que no pueden crear ni unirse a ninguno.
        openModpacksBtn.disabled = true;
    }
}

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
    msLoginBtn.innerText = 'Abriendo ventana de login...';
    const result = await window.electronAPI.loginMicrosoft();
    msLoginBtn.disabled = false;
    msLoginBtn.innerText = 'Iniciar sesión con Microsoft';

    if (result && result.success) {
        renderAccount(result.account);
        showScreen('mainScreen');
        showToast('Sesión iniciada como ' + result.account.username, 'info');
    } else {
        showToast((result && result.message) || 'No se pudo iniciar sesión con Microsoft.', 'error');
    }
});

switchAccountBtn.addEventListener('click', async () => {
    await window.electronAPI.logout();
    showScreen('loginScreen');
});

// --- Java ---

async function runAutoDetect(silent) {
    if (!silent) javaHint.innerText = 'Buscando instalaciones de Java...';
    const detected = await window.electronAPI.autoDetectJava();
    if (detected) {
        javaPathInput.value = detected;
        javaHint.innerText = 'Detectado: ' + detected;
    } else if (!silent) {
        javaHint.innerText = 'No se encontró ninguna instalación de Java en este sistema.';
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
        activeModpackLabel.innerText = `📦 ${activeModpack.name} · MC ${activeModpack.mc_version}`;
    } else {
        activeModpackLabel.innerText = 'Vanilla · consultando última versión...';
        window.electronAPI.getLatestVersion().then((version) => {
            if (!document.getElementById('mainScreen').dataset.modpackActive) {
                activeModpackLabel.innerText = `Vanilla · ${version} (última release)`;
            }
        });
    }
}

openModpacksBtn.addEventListener('click', () => {
    showScreen('modpacksScreen');
    loadModpacks();
});

backToMainBtn.addEventListener('click', () => showScreen('mainScreen'));

useVanillaBtn.addEventListener('click', async () => {
    await window.electronAPI.selectActiveModpack(null, null, null);
    document.getElementById('mainScreen').dataset.modpackActive = '';
    updateActiveModpackLabel(null);
    showToast('Ahora jugarás con Minecraft vanilla.', 'info');
    showScreen('mainScreen');
});

// --- Carga inicial ---

window.electronAPI.getConfig().then(async (cfg) => {
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

    playBtn.innerText = 'Iniciando juego...';
    playBtn.disabled = true;
    stopBtn.disabled = false;

    progressWrap.style.display = 'block';
    progressFill.style.width = '0%';
    progressLabel.innerText = 'Preparando...';
});

stopBtn.addEventListener('click', () => {
    window.electronAPI.stopGame();
});

function resetToIdle() {
    playBtn.innerText = 'Iniciar Juego';
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
    } else if (data.type === 'launched') {
        playBtn.innerText = 'Juego iniciado';
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
        progressLabel.innerText = `${data.type || 'Preparando'}... ${percent}%`;
    } else if (data.current !== undefined) {
        const fileName = data.name ? data.name.split(/[\\/]/).pop() : (data.type || 'archivo');
        progressLabel.innerText = `Descargando ${fileName}...`;
    }
});

// ============================================================================
// MODPACKS
// ============================================================================

function modpackItemHtml(pack, isOwner) {
    return `
        <div class="modpack-item" data-id="${pack.id}">
            <div class="modpack-item-info">
                <div class="modpack-item-name">${escapeHtml(pack.name)}</div>
                <div class="modpack-item-meta">MC ${escapeHtml(pack.mc_version)}${isOwner ? ' · creado por ti' : ''}</div>
            </div>
            <div class="modpack-item-actions">
                ${isOwner ? `<button class="secondary manage-btn" data-id="${pack.id}" data-name="${escapeHtml(pack.name)}">Gestionar</button>` : ''}
                <button class="select-btn" data-id="${pack.id}" data-name="${escapeHtml(pack.name)}" data-version="${escapeHtml(pack.mc_version)}">Jugar</button>
            </div>
        </div>
    `;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = str == null ? '' : String(str);
    return div.innerHTML;
}

async function loadModpacks() {
    ownedModpacksList.innerHTML = '<div class="empty-hint">Cargando...</div>';
    sharedModpacksList.innerHTML = '<div class="empty-hint">Cargando...</div>';
    try {
        const data = await window.electronAPI.getMyModpacks();

        ownedModpacksList.innerHTML = data.owned.length
            ? data.owned.map(p => modpackItemHtml(p, true)).join('')
            : '<div class="empty-hint">Todavía no has creado ningún modpack.</div>';

        sharedModpacksList.innerHTML = data.shared.length
            ? data.shared.map(p => modpackItemHtml(p, false)).join('')
            : '<div class="empty-hint">Nadie te ha compartido ningún modpack todavía.</div>';

        document.querySelectorAll('.manage-btn').forEach(btn => {
            btn.addEventListener('click', () => openModsModal(btn.dataset.id, btn.dataset.name));
        });
        document.querySelectorAll('.select-btn').forEach(btn => {
            btn.addEventListener('click', () => selectAndSyncModpack(btn.dataset.id, btn.dataset.name, btn.dataset.version, btn));
        });
    } catch (err) {
        ownedModpacksList.innerHTML = '';
        sharedModpacksList.innerHTML = '';
        showToast(err.message || 'No se pudieron cargar los modpacks.', 'error');
    }
}

createModpackBtn.addEventListener('click', async () => {
    const name = newModpackName.value.trim();
    const version = newModpackVersion.value.trim();
    if (!name || !version) {
        showToast('Ponle un nombre y una versión de Minecraft al modpack.', 'error');
        return;
    }
    try {
        await window.electronAPI.createModpack(name, version);
        newModpackName.value = '';
        newModpackVersion.value = '';
        showToast('Modpack creado.', 'info');
        loadModpacks();
    } catch (err) {
        showToast(err.message || 'No se pudo crear el modpack.', 'error');
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
        showToast(`Te has unido al modpack "${result.modpack.name}".`, 'info');
        inviteLinkInput.value = '';
        loadModpacks();
    } catch (err) {
        showToast(err.message || 'No se pudo canjear la invitación.', 'error');
    }
}

redeemInviteBtn.addEventListener('click', () => redeemInvite(inviteLinkInput.value));

// Cuando el sistema operativo abre un link milauncher://invite/TOKEN
window.electronAPI.onInviteReceived((data) => {
    showScreen('modpacksScreen');
    loadModpacks();
    redeemInvite(data.token);
});

async function selectAndSyncModpack(id, name, mcVersion, buttonEl) {
    const originalText = buttonEl.innerText;
    buttonEl.disabled = true;
    buttonEl.innerText = 'Sincronizando...';

    const removeProgressListener = window.electronAPI.onModpackSyncProgress((data) => {
        if (data.modpackId === id) {
            buttonEl.innerText = `${data.percent}%`;
        }
    });

    try {
        await window.electronAPI.syncModpack(id);
        await window.electronAPI.selectActiveModpack(id, name, mcVersion);
        document.getElementById('mainScreen').dataset.modpackActive = '1';
        updateActiveModpackLabel({ name, mc_version: mcVersion });
        showToast(`Listo. Vas a jugar con "${name}".`, 'info');
        showScreen('mainScreen');
    } catch (err) {
        showToast(err.message || 'No se pudo sincronizar el modpack.', 'error');
    } finally {
        buttonEl.disabled = false;
        buttonEl.innerText = originalText;
    }
}

// --- Modal de gestión de mods ---

async function openModsModal(id, name) {
    currentModsModalId = id;
    modsModalTitle.innerText = `Gestionar mods · ${name}`;
    inviteResultBox.classList.remove('active');
    inviteResultBox.innerText = '';
    modsModal.classList.add('active');
    await reloadModsList();
}

async function reloadModsList() {
    if (!currentModsModalId) return;
    modsList.innerHTML = '<div class="empty-hint">Cargando...</div>';
    try {
        const manifest = await window.electronAPI.getModpackManifest(currentModsModalId);
        modsList.innerHTML = manifest.mods.length
            ? manifest.mods.map(mod => `
                <div class="mod-item" data-mod-id="${mod.id}">
                    <span>${escapeHtml(mod.filename)}</span>
                    <button class="mod-item-remove" data-mod-id="${mod.id}" title="Quitar mod">&times;</button>
                </div>
            `).join('')
            : '<div class="empty-hint">Este modpack todavía no tiene mods.</div>';

        modsList.querySelectorAll('.mod-item-remove').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await window.electronAPI.removeModFromModpack(currentModsModalId, btn.dataset.modId);
                    showToast('Mod eliminado. Se actualizará en todos los launchers.', 'info');
                    await reloadModsList();
                } catch (err) {
                    showToast(err.message || 'No se pudo quitar el mod.', 'error');
                }
            });
        });
    } catch (err) {
        modsList.innerHTML = '';
        showToast(err.message || 'No se pudo cargar la lista de mods.', 'error');
    }
}

addModBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;
    addModBtn.disabled = true;
    addModBtn.innerText = 'Subiendo...';
    try {
        const result = await window.electronAPI.addModToModpack(currentModsModalId);
        if (!result.cancelled) {
            showToast(`${result.uploaded.length} mod(s) añadidos. Se actualizarán en todos los launchers.`, 'info');
            await reloadModsList();
        }
    } catch (err) {
        showToast(err.message || 'No se pudo subir el mod.', 'error');
    } finally {
        addModBtn.disabled = false;
        addModBtn.innerText = 'Añadir mod (.jar)';
    }
});

closeModsModalBtn.addEventListener('click', () => {
    modsModal.classList.remove('active');
    currentModsModalId = null;
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
            showToast('Link copiado al portapapeles.', 'info');
        }
    } catch (err) {
        showToast(err.message || 'No se pudo generar la invitación.', 'error');
    }
});
