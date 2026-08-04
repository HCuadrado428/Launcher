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
