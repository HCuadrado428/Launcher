// --- Galería de capturas de pantalla ---
// screenshots/ lo genera el propio Minecraft (tecla F2), el launcher nunca
// escribe ahí; esto solo lo hace visible sin tener que ir a buscarlo a mano
// en el explorador de archivos.

let currentScreenshotsInstanceId = null;

function renderScreenshotsGrid(shots) {
    if (!shots.length) {
        screenshotsGrid.innerHTML = `<div class="empty-hint">${t('screenshots.empty')}</div>`;
        return;
    }
    screenshotsGrid.innerHTML = shots.map((shot, i) => `
        <div class="screenshot-item" data-index="${i}">
            ${shot.thumbnail
                ? `<img src="${shot.thumbnail}" alt="${escapeHtml(shot.filename)}" class="screenshot-thumb">`
                : `<div class="screenshot-thumb screenshot-thumb-broken">🖼️</div>`}
            <button class="screenshot-delete" data-index="${i}" title="${t('screenshots.delete')}">&times;</button>
        </div>
    `).join('');

    screenshotsGrid.querySelectorAll('.screenshot-thumb').forEach((el) => {
        el.addEventListener('click', () => {
            const index = Number(el.closest('.screenshot-item').dataset.index);
            window.electronAPI.openScreenshot(currentScreenshotsInstanceId, shots[index].filename);
        });
    });
    screenshotsGrid.querySelectorAll('.screenshot-delete').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const index = Number(btn.dataset.index);
            const confirmed = confirm(t('screenshots.deleteConfirm'));
            if (!confirmed) return;
            try {
                await window.electronAPI.deleteScreenshot(currentScreenshotsInstanceId, shots[index].filename);
                shots.splice(index, 1);
                renderScreenshotsGrid(shots);
            } catch (err) {
                showToast(err.message || t('screenshots.deleteFailed'), 'error');
            }
        });
    });
}

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
        const shots = await window.electronAPI.listScreenshots(currentScreenshotsInstanceId);
        renderScreenshotsGrid(shots);
    } catch (err) {
        screenshotsGrid.innerHTML = '';
        showToast(err.message || t('screenshots.loadFailed'), 'error');
    }
});

closeScreenshotsModalBtn.addEventListener('click', () => {
    screenshotsModal.classList.remove('active');
});
