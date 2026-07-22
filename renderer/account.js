function renderAccount(account) {
    if (!account) return;
    currentAccount = account;
    accountName.innerText = account.username || '???';
    if (account.type === 'microsoft') {
        accountType.innerText = t('account.ms');
        if (account.uuid) {
            const fallbackLetter = (account.username || '?')[0].toUpperCase();
            avatar.classList.remove('avatar-render');
            avatar.innerText = fallbackLetter;
            // Se pide por IPC (no <img src> directo) porque Visage, el
            // respaldo si Crafatar está caído, exige una cabecera
            // User-Agent propia que un <img> normal no puede mandar.
            window.electronAPI.getSkinRender(account.uuid).then((dataUri) => {
                if (!dataUri || currentAccount !== account) return;
                avatar.classList.add('avatar-render');
                avatar.innerHTML = `<img src="${dataUri}" alt="">`;
            });
        } else {
            avatar.classList.remove('avatar-render');
            avatar.innerText = (account.username || '?')[0].toUpperCase();
        }
        openModpacksBtn.disabled = false;
    } else {
        accountType.innerText = t('account.offline');
        avatar.classList.remove('avatar-render');
        avatar.innerHTML = '';
        avatar.innerText = (account.username || '?')[0].toUpperCase();
        // Las cuentas offline ahora sí se registran en el backend (como "no
        // premium"): pueden crear modpacks propios y unirse a los que les
        // compartan. Lo único que no pueden hacer es generar invitaciones
        // para compartir los suyos (ver el gateo por account.premium en
        // openModsModal).
        openModpacksBtn.disabled = false;
    }
}

// --- Idioma ---

let currentAppVersion = null;

languageSelect.addEventListener('change', () => {
    setLanguage(languageSelect.value);
    window.electronAPI.setLanguage(languageSelect.value);
    if (currentAppVersion) checkUpdatesBtn.innerText = t('app.checkUpdates', { version: currentAppVersion });
});

// --- Tema de color ---

function applyColorTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeSwatches.forEach((swatch) => {
        swatch.classList.toggle('active', swatch.dataset.theme === theme);
    });
}

themeSwitcher.addEventListener('click', (e) => {
    const swatch = e.target.closest('.theme-swatch');
    if (!swatch) return;
    applyColorTheme(swatch.dataset.theme);
    window.electronAPI.setColorTheme(swatch.dataset.theme);
});

// --- Login ---

offlineLoginBtn.addEventListener('click', async () => {
    offlineLoginBtn.disabled = true;
    try {
        const username = offlineUsername.value.trim() || 'Jugador';
        const account = await window.electronAPI.loginOffline(username);
        renderAccount(account);
        updateActiveModpackLabel(null);
        showScreen('mainScreen');
    } catch (err) {
        showToast(err.message || t('toast.msLoginFailed'), 'error');
    } finally {
        offlineLoginBtn.disabled = false;
    }
});

msLoginBtn.addEventListener('click', async () => {
    msLoginBtn.disabled = true;
    msLoginBtn.innerText = t('login.ms.opening');
    try {
        const result = await window.electronAPI.loginMicrosoft();
        if (result && result.success) {
            renderAccount(result.account);
            showScreen('mainScreen');
            showToast(t('toast.loggedIn', { name: result.account.username }), 'info');
        } else {
            showToast((result && result.message) || t('toast.msLoginFailed'), 'error');
        }
    } catch (err) {
        // Antes no había try/catch aquí: si loginMicrosoft() rechazaba, el
        // botón se quedaba deshabilitado con "Abriendo..." para siempre, sin
        // ninguna forma de reintentar sin recargar toda la app.
        showToast(err.message || t('toast.msLoginFailed'), 'error');
    } finally {
        msLoginBtn.disabled = false;
        msLoginBtn.innerText = t('login.ms.button');
    }
});

// --- Multi-cuenta ---

async function renderAccountsList() {
    const accounts = await window.electronAPI.getAccounts();
    if (accounts.length === 0) {
        accountsList.innerHTML = `<div class="empty-hint">${t('accounts.empty')}</div>`;
        return;
    }
    accountsList.innerHTML = accounts.map((a) => `
        <div class="account-row ${currentAccount && currentAccount.id === a.id ? 'active' : ''}" data-id="${a.id}">
            <div class="account-row-info">
                <div class="account-row-name">${a.username}</div>
                <div class="account-row-type">${a.type === 'microsoft' ? t('account.ms') : t('account.offline')}</div>
            </div>
            <button class="secondary use-account-btn" data-id="${a.id}" ${currentAccount && currentAccount.id === a.id ? 'disabled' : ''}>${t('accounts.use')}</button>
            <button class="danger remove-account-btn" data-id="${a.id}">${t('accounts.remove')}</button>
        </div>
    `).join('');
}

switchAccountBtn.addEventListener('click', async () => {
    await renderAccountsList();
    accountsModal.classList.add('active');
});

closeAccountsModalBtn.addEventListener('click', () => {
    accountsModal.classList.remove('active');
});

accountsList.addEventListener('click', async (e) => {
    const useBtn = e.target.closest('.use-account-btn');
    const removeBtn = e.target.closest('.remove-account-btn');

    if (useBtn) {
        try {
            const account = await window.electronAPI.switchAccount(useBtn.dataset.id);
            renderAccount(account);
            document.getElementById('mainScreen').dataset.modpackActive = '';
            updateActiveModpackLabel(null);
            await applyTargetSettings(null);
            accountsModal.classList.remove('active');
            showScreen('mainScreen');
            showToast(t('toast.loggedIn', { name: account.username }), 'info');
        } catch (err) {
            showToast(err.message || t('accounts.switchFailed'), 'error');
        }
    } else if (removeBtn) {
        const confirmed = confirm(t('accounts.removeConfirm'));
        if (!confirmed) return;
        try {
            const result = await window.electronAPI.removeAccount(removeBtn.dataset.id);
            if (result.removedActive) {
                currentAccount = null;
                accountsModal.classList.remove('active');
                showScreen('loginScreen');
            } else {
                await renderAccountsList();
            }
        } catch (err) {
            showToast(err.message || t('accounts.removeFailed'), 'error');
        }
    }
});

addOfflineAccountBtn.addEventListener('click', () => {
    accountsModal.classList.remove('active');
    showScreen('loginScreen');
});

addMicrosoftAccountBtn.addEventListener('click', () => {
    accountsModal.classList.remove('active');
    showScreen('loginScreen');
});

// El JWT del backend dura 30 días; cuando caduca, main.js ya cierra la
// sesión local por su cuenta (ver apiRequest en main.js) y avisa aquí para
// que la UI no se quede repitiendo "token inválido" en cada acción y en su
// lugar vuelva a la pantalla de login con un aviso claro.
window.electronAPI.onSessionExpired(() => {
    modsModal.classList.remove('active');
    accountsModal.classList.remove('active');
    showToast(t('toast.sessionExpired'), 'warning');
    showScreen('loginScreen');
});
