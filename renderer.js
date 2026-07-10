const loginScreen = document.getElementById('loginScreen');
const mainScreen = document.getElementById('mainScreen');

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
const versionLabel = document.getElementById('versionLabel');

const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const toastWrap = document.getElementById('toastWrap');

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
    accountName.innerText = account.username || '???';
    if (account.type === 'microsoft') {
        accountType.innerText = 'Cuenta Microsoft';
        if (account.uuid) {
            avatar.innerHTML = `<img src="https://crafatar.com/avatars/${account.uuid}?size=42&overlay" onerror="this.parentElement.innerText='${(account.username || '?')[0].toUpperCase()}'">`;
        } else {
            avatar.innerText = (account.username || '?')[0].toUpperCase();
        }
    } else {
        accountType.innerText = 'Cuenta no premium (offline)';
        avatar.innerHTML = '';
        avatar.innerText = (account.username || '?')[0].toUpperCase();
    }
}

// --- Login ---

offlineLoginBtn.addEventListener('click', async () => {
    const username = offlineUsername.value.trim() || 'Jugador';
    const account = await window.electronAPI.loginOffline(username);
    renderAccount(account);
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

    window.electronAPI.getLatestVersion().then((version) => {
        versionLabel.innerText = version + ' (última release)';
    });
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
        versionLabel.innerText = data.version + ' (última release)';
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

// minecraft-launcher-core emite dos tipos de evento de progreso
// distintos y NO hay que tratarlos igual:
//  - "progress" trae { type, task, total } -> progreso ESTABLE por
//    categoría (ej. "van descargados 40 de 120 assets"). Siempre
//    avanza hacia adelante. Esta es la que mueve la barra.
//  - "download-status" trae { name, type, current, total } ->
//    progreso de UN archivo individual (bytes de ese archivo).
//    Se resetea a 0 cada vez que empieza un archivo nuevo, así que
//    si la usamos para mover la barra, esta salta constantemente
//    hacia atrás (el "bugueo" que se veía). Solo la usamos para
//    mostrar qué archivo se está descargando ahora mismo.
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
