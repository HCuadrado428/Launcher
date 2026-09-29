// --- Jugar / detener ---

// Mientras se prepara el lanzamiento de un modpack, el proceso principal lo
// sincroniza (y puede tener que descargar mods, el loader o Java): se enseña
// ese progreso en la misma barra en vez de un "Preparando..." fijo.
let removeLaunchSyncListener = null;

function stopFollowingLaunchSync() {
    if (removeLaunchSyncListener) {
        removeLaunchSyncListener();
        removeLaunchSyncListener = null;
    }
}

// extra.server: dirección a la que entrar directamente al abrir el juego
// (botón "Entrar" de los servidores favoritos).
function startGame(extra = {}) {
    const maxGb = parseInt(ramSlider.value, 10);
    const minGb = Math.max(1, Math.round(maxGb / 2));

    stopFollowingLaunchSync();
    removeLaunchSyncListener = window.electronAPI.onModpackSyncProgress((data) => {
        progressWrap.style.display = 'block';
        progressFill.style.width = `${data.percent || 0}%`;
        progressLabel.innerText = data.label || t('main.progress.preparing');
    });

    window.electronAPI.launchGame({
        javaPath: javaPathInput.value,
        memory: { max: maxGb + 'G', min: minGb + 'G' },
        customArgs: customJvmArgsInput.value,
        ...extra
    });

    playBtn.innerText = t('main.playStarting');
    playBtn.disabled = true;
    stopBtn.disabled = false;

    progressWrap.style.display = 'block';
    progressFill.style.width = '0%';
    progressLabel.innerText = t('main.progress.preparing');

    gameLogLines = [];
    consoleLogBox.innerText = '';
}

playBtn.addEventListener('click', () => startGame());

// El proceso principal confirma con un 'stopped' cuando el juego se ha
// cerrado de verdad (o cuando ha cancelado un lanzamiento que todavía se
// estaba preparando, que puede tardar hasta acabar el paso en curso).
stopBtn.addEventListener('click', () => {
    stopBtn.disabled = true;
    if (progressWrap.style.display !== 'none') {
        progressLabel.innerText = t('main.progress.cancelling');
    }
    window.electronAPI.stopGame();
});

function resetToIdle() {
    stopFollowingLaunchSync();
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
    } else if (data.type === 'java-warning' || data.type === 'warning') {
        showToast(data.message, 'warning');
    } else if (data.type === 'version-fallback-warning') {
        showToast(data.message, 'warning');
    } else if (data.type === 'modpack-removed') {
        showToast(data.message, 'error');
        document.getElementById('mainScreen').dataset.modpackActive = '';
        updateActiveModpackLabel(null);
        resetToIdle();
    } else if (data.type === 'launched') {
        stopFollowingLaunchSync();
        playBtn.innerText = t('main.playStarted');
        progressWrap.style.display = 'none';
    } else if (data.type === 'closed' || data.type === 'stopped') {
        resetToIdle();
        if (data.type === 'closed' && data.code !== 0 && data.code !== undefined) showCrashToast(data);
        window.electronAPI.getConfig().then((cfg) => {
            updatePlaytimeLabel(cfg && cfg.activeModpack ? cfg.activeModpack.id : null);
        });
    }
});

// Tras un cierre con error: una pista concreta si el proceso principal
// reconoció la causa en el log (claves crash.hint.*), y un botón para abrir
// el crash log guardado.
function showCrashToast(data) {
    const hintKey = data.crashHint ? `crash.hint.${data.crashHint}` : null;
    const message = hintKey && t(hintKey) !== hintKey ? t(hintKey) : t('crash.generic', { code: data.code });
    const action = data.hasCrashLog
        ? { label: t('crash.openLog'), onClick: () => window.electronAPI.openLastCrashLog() }
        : null;
    showToast(message, 'warning', action);
}

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
        // Solo se añade la línea nueva (barato) en vez de reconstruir y
        // volver a pintar el bloque entero de texto en cada línea, que con
        // un juego que suelta muchas líneas por segundo (típico al cargar
        // mods) se notaba como lag mientras la consola estaba abierta.
        consoleLogBox.appendChild(document.createTextNode(line));
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

openCrashLogsBtn.addEventListener('click', () => {
    window.electronAPI.openCrashLogsFolder();
});

openActiveInstanceFolderBtn.addEventListener('click', async () => {
    const cfg = await window.electronAPI.getConfig();
    window.electronAPI.openInstanceFolder(cfg && cfg.activeModpack ? cfg.activeModpack.id : null);
});

exportSavesBtn.addEventListener('click', async () => {
    exportSavesBtn.disabled = true;
    try {
        const cfg = await window.electronAPI.getConfig();
        const id = cfg && cfg.activeModpack ? cfg.activeModpack.id : null;
        const name = cfg && cfg.activeModpack ? cfg.activeModpack.name : 'vanilla';
        const result = await window.electronAPI.exportSaves(id, name);
        if (!result.cancelled) {
            showToast(t('toast.savesExported', { count: result.fileCount }), 'info');
        }
    } catch (err) {
        showToast(err.message || t('toast.savesExportFailed'), 'error');
    } finally {
        exportSavesBtn.disabled = false;
    }
});
