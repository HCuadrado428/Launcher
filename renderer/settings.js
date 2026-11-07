// --- Java ---

async function runAutoDetect() {
    javaHint.innerText = t('toast.javaSearching');
    const detected = await window.electronAPI.autoDetectJava();
    if (detected) {
        javaPathInput.value = detected;
        javaHint.innerText = t('toast.javaDetected', { path: detected });
    } else {
        javaHint.innerText = t('toast.javaNotFound');
    }
    return detected;
}

// La RAM y la ruta de Java se guardan por modpack (o para "vanilla" si no
// hay ninguno activo), así que hay que refrescar estos campos cada vez que
// cambia la instalación activa.
//
// Un campo de Java vacío significa "automático": el proceso principal usa (y
// descarga si hace falta) el Java oficial que corresponde a cada versión de
// Minecraft. Por eso ya no se rellena solo con el Java detectado en el
// sistema; "Detectar" y "Buscar..." siguen ahí para elegir uno a mano.
function updateJavaHint() {
    javaHint.innerText = javaPathInput.value.trim() ? '' : t('main.java.autoHint');
}

javaPathInput.addEventListener('input', updateJavaHint);

async function applyTargetSettings(modpackId) {
    const settings = await window.electronAPI.getTargetSettings(modpackId);

    javaPathInput.value = (settings && settings.javaPath) || '';
    updateJavaHint();

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
    refreshRecommendedMemory(modpackId);
}

// RAM sugerida para la instalación activa (según sus mods y la RAM del
// sistema); se enseña bajo el slider salvo que haya un aviso más importante.
let recommendedMemoryGb = null;

async function refreshRecommendedMemory(modpackId) {
    try {
        recommendedMemoryGb = (await window.electronAPI.getRecommendedMemory(modpackId)).gb;
    } catch (err) {
        recommendedMemoryGb = null;
    }
    updateRamHint();
}

hideWhilePlayingCheckbox.addEventListener('change', () => {
    window.electronAPI.setHideWhilePlaying(hideWhilePlayingCheckbox.checked);
});

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

detectBtn.addEventListener('click', () => runAutoDetect());

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
    const selected = parseInt(ramSlider.value, 10);
    if (systemRamGb && selected > systemRamGb) {
        ramHint.innerText = t('main.ram.tooMuch', { total: systemRamGb });
        ramHint.classList.add('hint-warning');
        return;
    }
    ramHint.classList.remove('hint-warning');
    ramHint.innerText = recommendedMemoryGb && selected !== recommendedMemoryGb
        ? t('main.ram.recommended', { gb: recommendedMemoryGb })
        : '';
}

ramSlider.addEventListener('input', () => {
    ramValue.innerText = ramSlider.value + ' GB';
    updateRamHint();
});
