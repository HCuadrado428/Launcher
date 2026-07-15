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
