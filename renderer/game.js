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
    } else if (data.type === 'version-fallback-warning') {
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
