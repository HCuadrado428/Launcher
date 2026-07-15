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
                    const result = await window.electronAPI.addModFromModrinth(
                        currentModsModalId,
                        btn.dataset.projectId,
                        currentModsModalMcVersion,
                        currentModsModalLoader,
                        currentModsModalType
                    );
                    showToast(t('toast.modrinthAdded'), 'info');
                    if (result && result.missing_dependencies && result.missing_dependencies.length) {
                        showToast(t('modal.modrinth.missingDependencies', { names: result.missing_dependencies.join(', ') }), 'warning');
                    }
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
