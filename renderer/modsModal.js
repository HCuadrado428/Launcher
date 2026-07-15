// --- Modal de gestión de mods ---

let currentModsModalType = 'mod';
let currentModsModalIsOwner = true;
let currentManifestMods = [];
let currentOptionalChoices = {};

async function openModsModal(id, name, mcVersion, loader, isOwner = true) {
    currentModsModalId = id;
    currentModsModalName = name;
    currentModsModalMcVersion = mcVersion;
    currentModsModalLoader = loader;
    currentModsModalIsOwner = isOwner;
    currentModsModalType = 'mod';
    modsTypeTab.classList.add('active');
    resourcepacksTypeTab.classList.remove('active');
    addModBtn.innerText = t('modal.addMod');
    modsModalTitle.innerText = `${t('modal.title')} · ${name}`;
    inviteResultBox.classList.remove('active');
    inviteResultBox.innerText = '';
    modrinthSearchInput.value = '';
    modrinthResults.innerHTML = '';

    // Añadir mods, compartir, cambiar portada y borrar solo tiene sentido
    // (y el backend solo lo permite) para el dueño del modpack. Antes esto
    // ni se mostraba a quien no era dueño porque directamente no tenía forma
    // de abrir este modal para un modpack compartido; ahora que sí puede
    // (para poder reparar/verificar su propia instalación), se ocultan estas
    // secciones en vez de dejar que el jugador choque con un 403.
    addModBtn.style.display = isOwner ? '' : 'none';
    document.querySelector('.modrinth-search').style.display = isOwner ? '' : 'none';
    inviteField.style.display = isOwner ? '' : 'none';
    accessManagementSection.style.display = isOwner ? '' : 'none';
    versionHistorySection.style.display = isOwner ? '' : 'none';
    setCoverBtn.style.display = isOwner ? '' : 'none';
    deleteModpackBtn.style.display = isOwner ? '' : 'none';
    leaveModpackBtn.style.display = isOwner ? 'none' : '';

    if (isOwner) {
        // toPublicAccount() en main.js siempre calcula "premium" como un
        // booleano real ahora, así que si por lo que sea no hay cuenta
        // cargada, lo más seguro es no mostrar el botón en vez de asumir
        // que sí puede compartir (el backend lo bloquearía igualmente, pero
        // mejor que el hint sea el que se vea, no un 403 confuso).
        const isPremium = Boolean(currentAccount && currentAccount.premium);
        generateInviteBtn.style.display = isPremium ? '' : 'none';
        inviteNonPremiumHint.style.display = isPremium ? 'none' : '';
        await loadInvitesAndAccess();
        await loadVersionHistory();
    }

    modsModal.classList.add('active');
    await reloadModsList();
    await refreshModpackHealth(id);
}

async function loadInvitesAndAccess() {
    try {
        const [invites, accessUsers] = await Promise.all([
            window.electronAPI.listInvites(currentModsModalId),
            window.electronAPI.listModpackAccess(currentModsModalId)
        ]);

        invitesList.innerHTML = invites.length
            ? invites.map(inv => `
                <div class="mod-item" data-token="${inv.token}">
                    <span>${inv.uses}${inv.max_uses ? '/' + inv.max_uses : ''} ${t('modal.access.uses')}${inv.expires_at ? ' · ' + new Date(inv.expires_at).toLocaleDateString() : ''}</span>
                    <button class="mod-item-update" data-token="${inv.token}" title="${t('modal.access.copyLink')}">📋</button>
                    <button class="mod-item-remove" data-token="${inv.token}" title="${t('modal.access.revoke')}">&times;</button>
                </div>
            `).join('')
            : `<div class="empty-hint">${t('modal.access.noInvites')}</div>`;
        invitesList.querySelectorAll('.mod-item-update').forEach(btn => {
            btn.addEventListener('click', async () => {
                const url = `milauncher://invite/${btn.dataset.token}`;
                if (navigator.clipboard) {
                    await navigator.clipboard.writeText(url);
                    showToast(t('toast.inviteCopied'), 'info');
                }
            });
        });
        invitesList.querySelectorAll('.mod-item-remove').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await window.electronAPI.revokeInvite(currentModsModalId, btn.dataset.token);
                    showToast(t('modal.access.inviteRevoked'), 'info');
                    await loadInvitesAndAccess();
                } catch (err) {
                    showToast(err.message || t('modal.access.revokeFailed'), 'error');
                }
            });
        });

        accessList.innerHTML = accessUsers.length
            ? accessUsers.map(u => `
                <div class="mod-item" data-uuid="${u.uuid}">
                    <span>${escapeHtml(u.username || u.uuid)}</span>
                    <button class="mod-item-remove" data-uuid="${u.uuid}" title="${t('modal.access.revoke')}">&times;</button>
                </div>
            `).join('')
            : `<div class="empty-hint">${t('modal.access.noAccess')}</div>`;
        accessList.querySelectorAll('.mod-item-remove').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await window.electronAPI.revokeModpackAccess(currentModsModalId, btn.dataset.uuid);
                    showToast(t('modal.access.accessRevoked'), 'info');
                    await loadInvitesAndAccess();
                } catch (err) {
                    showToast(err.message || t('modal.access.revokeFailed'), 'error');
                }
            });
        });
    } catch (err) {
        showToast(err.message || t('modal.access.loadFailed'), 'error');
    }
}

async function loadVersionHistory() {
    try {
        const versions = await window.electronAPI.listModpackVersions(currentModsModalId);
        versionsList.innerHTML = versions.length
            ? versions.map(v => `
                <div class="mod-item" data-version-id="${v.id}">
                    <span>${new Date(v.created_at).toLocaleString()} · ${v.mod_count} mods</span>
                    <button class="secondary" data-version-id="${v.id}" data-restore>${t('modal.versions.restore')}</button>
                </div>
            `).join('')
            : `<div class="empty-hint">${t('modal.versions.empty')}</div>`;
        versionsList.querySelectorAll('[data-restore]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const confirmed = confirm(t('modal.versions.restoreConfirm'));
                if (!confirmed) return;
                try {
                    const result = await window.electronAPI.restoreModpackVersion(currentModsModalId, btn.dataset.versionId);
                    showToast(t('modal.versions.restored'), 'info');
                    if (result && result.skipped_files && result.skipped_files.length) {
                        showToast(t('modal.versions.skippedFiles', { names: result.skipped_files.join(', ') }), 'warning');
                    }
                    await reloadModsList();
                    await loadVersionHistory();
                } catch (err) {
                    showToast(err.message || t('modal.versions.restoreFailed'), 'error');
                }
            });
        });
    } catch (err) {
        showToast(err.message || t('modal.versions.loadFailed'), 'error');
    }
}

// El botón "Reparar instalación" borra y vuelve a descargar todo, así que
// no tiene sentido tenerlo siempre a la vista: solo aparece cuando la
// comprobación local (rápida, sin tocar el servidor) detecta que falta algo
// de lo que la propia instalación dice que debería tener.
async function refreshModpackHealth(id) {
    modpackHealthStatus.classList.remove('active', 'ok', 'broken');
    repairModpackBtn.style.display = 'none';

    const result = await window.electronAPI.checkModpackHealth(id);
    const synced = Boolean(result && result.synced);
    // Verificar/exportar tampoco tienen sentido si el modpack nunca se ha
    // sincronizado en este ordenador: no hay nada local que comprobar ni
    // que empaquetar todavía.
    verifyModpackBtn.style.display = synced ? '' : 'none';
    exportModpackBtn.style.display = synced ? '' : 'none';
    if (!synced) return;

    if (result.healthy) {
        modpackHealthStatus.textContent = t('health.ok');
        modpackHealthStatus.classList.add('active', 'ok');
    } else {
        modpackHealthStatus.textContent = t('health.broken');
        modpackHealthStatus.classList.add('active', 'broken');
        repairModpackBtn.style.display = '';
    }
}

function renderModsList() {
    const filtered = currentManifestMods.filter(mod => (mod.type || 'mod') === currentModsModalType);
    const emptyKey = currentModsModalType === 'resourcepack' ? 'modal.resourcepacks.empty' : 'modal.mods.empty';
    modsList.innerHTML = filtered.length
        ? filtered.map(mod => {
            const included = currentOptionalChoices[mod.id] !== false; // ausencia = incluido
            const optionalToggle = mod.optional
                ? `<label class="mod-item-optional-toggle"><input type="checkbox" class="mod-item-optional-checkbox" data-mod-id="${mod.id}" ${included ? 'checked' : ''}> ${t('modal.mods.includeToggle')}</label>`
                : '';
            return `
            <div class="mod-item" data-mod-id="${mod.id}">
                <span>${escapeHtml(mod.filename)}${mod.optional ? ` <span class="mod-item-badge">${t('modal.mods.optionalBadge')}</span>` : ''}</span>
                ${optionalToggle}
                ${currentModsModalIsOwner && mod.source === 'modrinth' ? `<button class="mod-item-update" data-mod-id="${mod.id}" title="${t('modal.mods.checkUpdate')}">↻</button>` : ''}
                ${currentModsModalIsOwner ? `<button class="mod-item-remove" data-mod-id="${mod.id}" title="Quitar">&times;</button>` : ''}
            </div>
        `;
        }).join('')
        : `<div class="empty-hint">${t(emptyKey)}</div>`;

    modsList.querySelectorAll('.mod-item-remove').forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                await window.electronAPI.removeModFromModpack(currentModsModalId, btn.dataset.modId);
                showToast(t('toast.modRemoved'), 'info');
                await reloadModsList();
            } catch (err) {
                showToast(err.message || t('toast.modRemoveFailed'), 'error');
            }
        });
    });

    modsList.querySelectorAll('.mod-item-update').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                const result = await window.electronAPI.checkModUpdate(currentModsModalId, btn.dataset.modId);
                showToast(
                    result.has_update
                        ? t('modal.mods.updateAvailable', { version: result.latest_version_number || '' })
                        : t('modal.mods.upToDate'),
                    result.has_update ? 'info' : 'info'
                );
            } catch (err) {
                showToast(err.message || t('modal.mods.updateCheckFailed'), 'error');
            } finally {
                btn.disabled = false;
            }
        });
    });

    modsList.querySelectorAll('.mod-item-optional-checkbox').forEach(cb => {
        cb.addEventListener('change', async () => {
            currentOptionalChoices = { ...currentOptionalChoices, [cb.dataset.modId]: cb.checked };
            try {
                await window.electronAPI.setOptionalModChoice(currentModsModalId, cb.dataset.modId, cb.checked);
                showToast(t('modal.mods.optionalChoiceSaved'), 'info');
            } catch (err) {
                showToast(err.message || t('modal.mods.optionalChoiceFailed'), 'error');
            }
        });
    });
}

async function reloadModsList() {
    if (!currentModsModalId) return;
    modsList.innerHTML = `<div class="empty-hint">${t('common.loading')}</div>`;
    try {
        const [manifest, choices] = await Promise.all([
            window.electronAPI.getModpackManifest(currentModsModalId),
            window.electronAPI.getOptionalModChoices(currentModsModalId)
        ]);
        currentManifestMods = manifest.mods;
        currentOptionalChoices = choices || {};
        renderModsList();
    } catch (err) {
        modsList.innerHTML = '';
        showToast(err.message || t('toast.modpackManifestLoadFailed'), 'error');
    }
}

function selectModsModalType(type) {
    currentModsModalType = type;
    modsTypeTab.classList.toggle('active', type === 'mod');
    resourcepacksTypeTab.classList.toggle('active', type === 'resourcepack');
    addModBtn.innerText = type === 'resourcepack' ? t('modal.addResourcePack') : t('modal.addMod');
    modrinthResults.innerHTML = '';
    renderModsList();
}

modsTypeTab.addEventListener('click', () => selectModsModalType('mod'));
resourcepacksTypeTab.addEventListener('click', () => selectModsModalType('resourcepack'));

addModBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;
    const uploadingText = t('modal.addModUploading');
    addModBtn.disabled = true;
    addModBtn.innerText = uploadingText;
    try {
        const result = await window.electronAPI.addModToModpack(currentModsModalId, currentModsModalType);
        if (!result.cancelled) {
            showToast(t('toast.modsUploaded', { count: result.uploaded.length }), 'info');
            await reloadModsList();
        }
    } catch (err) {
        showToast(err.message || t('toast.modUploadFailed'), 'error');
    } finally {
        addModBtn.disabled = false;
        addModBtn.innerText = currentModsModalType === 'resourcepack' ? t('modal.addResourcePack') : t('modal.addMod');
    }
});

closeModsModalBtn.addEventListener('click', () => {
    modsModal.classList.remove('active');
    currentModsModalId = null;
    currentModsModalName = null;
    loadModpacks();
});

generateInviteBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;
    const maxUsesRaw = inviteMaxUsesInput.value.trim();
    const expiresHoursRaw = inviteExpiresHoursInput.value.trim();
    const maxUses = maxUsesRaw ? parseInt(maxUsesRaw, 10) : null;
    const expiresHours = expiresHoursRaw ? parseFloat(expiresHoursRaw) : null;
    try {
        const result = await window.electronAPI.createInvite(currentModsModalId, maxUses, expiresHours);
        inviteResultBox.innerText = result.url;
        inviteResultBox.classList.add('active');
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(result.url);
            showToast(t('toast.inviteCopied'), 'info');
        }
        inviteMaxUsesInput.value = '';
        inviteExpiresHoursInput.value = '';
        await loadInvitesAndAccess();
    } catch (err) {
        showToast(err.message || t('toast.inviteCreateFailed'), 'error');
    }
});

repairModpackBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;
    const confirmed = confirm(t('modal.repairConfirm', { name: currentModsModalName || '' }));
    if (!confirmed) return;

    repairModpackBtn.disabled = true;
    const originalText = repairModpackBtn.innerText;

    const removeProgressListener = window.electronAPI.onModpackSyncProgress((data) => {
        if (data.modpackId === currentModsModalId) {
            repairModpackBtn.innerText = `${data.label || ''} ${data.percent}%`;
        }
    });

    try {
        await window.electronAPI.repairModpack(currentModsModalId);
        showToast(t('toast.modpackRepaired'), 'info');
        await refreshModpackHealth(currentModsModalId);
    } catch (err) {
        showToast(err.message || t('toast.modpackRepairFailed'), 'error');
    } finally {
        removeProgressListener();
        repairModpackBtn.disabled = false;
        repairModpackBtn.innerText = originalText;
    }
});

setCoverBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;
    setCoverBtn.disabled = true;
    try {
        const result = await window.electronAPI.setModpackCover(currentModsModalId);
        if (!result.cancelled) {
            showToast(t('toast.coverUpdated'), 'info');
        }
    } catch (err) {
        showToast(err.message || t('toast.coverUpdateFailed'), 'error');
    } finally {
        setCoverBtn.disabled = false;
    }
});

verifyModpackBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;

    verifyModpackBtn.disabled = true;
    const originalText = verifyModpackBtn.innerText;

    const removeProgressListener = window.electronAPI.onModpackSyncProgress((data) => {
        if (data.modpackId === currentModsModalId) {
            verifyModpackBtn.innerText = `${data.label || ''} ${data.percent}%`;
        }
    });

    try {
        const result = await window.electronAPI.verifyModpackFiles(currentModsModalId);
        showToast(t('toast.modpackVerified', { checked: result.checked, fixed: result.fixed }), 'info');
        await refreshModpackHealth(currentModsModalId);
    } catch (err) {
        showToast(err.message || t('toast.modpackVerifyFailed'), 'error');
    } finally {
        removeProgressListener();
        verifyModpackBtn.disabled = false;
        verifyModpackBtn.innerText = originalText;
    }
});

exportModpackBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;

    exportModpackBtn.disabled = true;
    try {
        const result = await window.electronAPI.exportModpack(currentModsModalId, currentModsModalName);
        if (!result.cancelled) {
            showToast(t('toast.modpackExported', { count: result.fileCount }), 'info');
        }
    } catch (err) {
        showToast(err.message || t('toast.modpackExportFailed'), 'error');
    } finally {
        exportModpackBtn.disabled = false;
    }
});

deleteModpackBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;
    const confirmed = confirm(t('modal.deleteConfirm', { name: currentModsModalName || '' }));
    if (!confirmed) return;

    deleteModpackBtn.disabled = true;
    deleteModpackBtn.innerText = t('modal.deleting');
    try {
        await window.electronAPI.deleteModpack(currentModsModalId);
        showToast(t('toast.modpackDeleted'), 'info');
        modsModal.classList.remove('active');
        currentModsModalId = null;
        currentModsModalName = null;
        loadModpacks();
    } catch (err) {
        showToast(err.message || t('toast.modpackDeleteFailed'), 'error');
    } finally {
        deleteModpackBtn.disabled = false;
        deleteModpackBtn.innerText = t('modal.deleteModpack');
    }
});

leaveModpackBtn.addEventListener('click', async () => {
    if (!currentModsModalId) return;
    const confirmed = confirm(t('modal.leaveConfirm', { name: currentModsModalName || '' }));
    if (!confirmed) return;

    leaveModpackBtn.disabled = true;
    try {
        await window.electronAPI.leaveModpack(currentModsModalId);
        showToast(t('toast.modpackLeft'), 'info');
        modsModal.classList.remove('active');
        currentModsModalId = null;
        currentModsModalName = null;
        loadModpacks();
    } catch (err) {
        showToast(err.message || t('toast.modpackLeaveFailed'), 'error');
    } finally {
        leaveModpackBtn.disabled = false;
    }
});
