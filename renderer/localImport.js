// ============================================================================
// IMPORTAR MODPACK LOCAL (CurseForge App / Modrinth App)
// ============================================================================

openImportModalBtn.addEventListener('click', () => {
    importModal.classList.add('active');
    importResults.innerHTML = '';
});

closeImportModalBtn.addEventListener('click', () => {
    importModal.classList.remove('active');
    loadModpacks();
});

function importItemHtml(instance) {
    const icon = SOURCE_ICONS[instance.source] || '📦';
    const sourceLabel = SOURCE_LABELS[instance.source] || instance.source;
    let meta;
    let actionHtml;
    if (instance.source === 'curseforge') {
        meta = `${sourceLabel} · ${t('import.curseforge.needsKey')}`;
        actionHtml = '';
    } else {
        meta = instance.mcVersion
            ? `${sourceLabel} · MC ${escapeHtml(instance.mcVersion)}${instance.loader ? ' · ' + escapeHtml(instance.loader) : ''} · ${instance.resolvedCount}/${instance.modCount} ${t('import.mods.identified')}`
            : `${sourceLabel} · ${t('import.mods.unresolved')}`;
        actionHtml = instance.importable
            ? `<button class="import-btn" data-path="${escapeHtml(instance.path)}">${t('import.button')}</button>`
            : '';
    }
    const isUnavailable = instance.source === 'curseforge' || !instance.importable;
    return `
        <div class="import-item ${isUnavailable ? 'unavailable' : ''}">
            <div class="import-item-icon">${icon}</div>
            <div class="import-item-info">
                <div class="import-item-name">${escapeHtml(instance.name)}</div>
                <div class="import-item-meta">${meta}</div>
            </div>
            ${actionHtml}
        </div>
    `;
}

scanLocalModpacksBtn.addEventListener('click', async () => {
    scanLocalModpacksBtn.disabled = true;
    scanLocalModpacksBtn.innerText = t('common.loading');
    importResults.innerHTML = '';
    try {
        const instances = await window.electronAPI.scanLocalModpacks();
        importResults.innerHTML = instances.length
            ? instances.map(importItemHtml).join('')
            : `<div class="empty-hint">${t('import.empty')}</div>`;

        importResults.querySelectorAll('.import-btn').forEach(btn => {
            btn.addEventListener('click', () => importLocalModpack(btn.dataset.path, btn));
        });
    } catch (err) {
        importResults.innerHTML = '';
        showToast(err.message || t('import.scanFailed'), 'error');
    } finally {
        scanLocalModpacksBtn.disabled = false;
        scanLocalModpacksBtn.innerText = t('import.scan');
    }
});

async function importLocalModpack(instancePath, buttonEl) {
    const originalText = buttonEl.innerText;
    buttonEl.disabled = true;
    buttonEl.innerText = '...';

    const removeProgressListener = window.electronAPI.onModpackSyncProgress((data) => {
        buttonEl.innerText = `${data.percent}%`;
    });

    try {
        const result = await window.electronAPI.importLocalModpack(instancePath);
        let message = t('import.success', { name: result.modpack.name, count: result.imported });
        if (result.skipped > 0 || result.unresolvedCount > 0) {
            message += ' ' + t('import.partial', { count: result.skipped + result.unresolvedCount });
        }
        showToast(message, 'info');
        importModal.classList.remove('active');
        loadModpacks();
    } catch (err) {
        showToast(err.message || t('import.failed'), 'error');
        buttonEl.disabled = false;
        buttonEl.innerText = originalText;
    } finally {
        removeProgressListener();
    }
}

saveCurseforgeApiKeyBtn.addEventListener('click', async () => {
    await window.electronAPI.setCurseForgeApiKey(curseforgeApiKeyInput.value.trim());
    showToast(t('import.curseforgeKey.saved'), 'info');
});
