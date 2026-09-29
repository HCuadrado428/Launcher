// --- Galería de capturas de pantalla ---
// screenshots/ lo genera el propio Minecraft (tecla F2), el launcher nunca
// escribe ahí; esto solo lo hace visible sin tener que ir a buscarlo a mano
// en el explorador de archivos.

let currentScreenshotsInstanceId = null;
let currentScreenshots = [];

function renderScreenshotsGrid() {
    if (!currentScreenshots.length) {
        screenshotsGrid.innerHTML = `<div class="empty-hint">${t('screenshots.empty')}</div>`;
        return;
    }
    screenshotsGrid.innerHTML = currentScreenshots.map((shot, i) => `
        <div class="screenshot-item" data-index="${i}">
            ${shot.thumbnail
                ? `<img src="${escapeHtml(shot.thumbnail)}" alt="${escapeHtml(shot.filename)}" class="screenshot-thumb">`
                : `<div class="screenshot-thumb screenshot-thumb-broken">🖼️</div>`}
            <button class="screenshot-delete" title="${t('screenshots.delete')}">&times;</button>
        </div>
    `).join('');
}

// Un solo listener para toda la galería en vez de dos por captura.
screenshotsGrid.addEventListener('click', async (e) => {
    const item = e.target.closest('.screenshot-item');
    if (!item) return;
    const shot = currentScreenshots[Number(item.dataset.index)];
    if (!shot) return;

    if (e.target.closest('.screenshot-delete')) {
        if (!confirm(t('screenshots.deleteConfirm'))) return;
        try {
            await window.electronAPI.deleteScreenshot(currentScreenshotsInstanceId, shot.filename);
            currentScreenshots = currentScreenshots.filter((s) => s !== shot);
            renderScreenshotsGrid();
        } catch (err) {
            showToast(err.message || t('screenshots.deleteFailed'), 'error');
        }
    } else if (e.target.closest('.screenshot-thumb')) {
        window.electronAPI.openScreenshot(currentScreenshotsInstanceId, shot.filename);
    }
});

openScreenshotsBtn.addEventListener('click', async () => {
    // Este botón vive dentro del modal de consola: si no se cierra antes,
    // se quedan dos modales "activos" a la vez y el sistema de accesibilidad
    // de teclado (que asume uno solo abierto como mucho) le da Escape/Tab al
    // que no se ve en vez de al de capturas.
    consoleModal.classList.remove('active');
    const cfg = await window.electronAPI.getConfig();
    currentScreenshotsInstanceId = cfg && cfg.activeModpack ? cfg.activeModpack.id : null;
    screenshotsModal.classList.add('active');
    screenshotsGrid.innerHTML = `<div class="empty-hint">${t('common.loading')}</div>`;
    try {
        currentScreenshots = await window.electronAPI.listScreenshots(currentScreenshotsInstanceId);
        renderScreenshotsGrid();
    } catch (err) {
        screenshotsGrid.innerHTML = '';
        showToast(err.message || t('screenshots.loadFailed'), 'error');
    }
});

closeScreenshotsModalBtn.addEventListener('click', () => {
    screenshotsModal.classList.remove('active');
});
