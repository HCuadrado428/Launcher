// --- Carga inicial ---
// Se carga al final a propósito: llama a funciones definidas en el resto de
// archivos de renderer/ (renderAccount, applyColorTheme, updateActiveModpackLabel,
// applyTargetSettings...), así que necesita que ya existan cuando se ejecute.
// En la práctica no es estrictamente necesario que sea el último <script>
// (todo lo de aquí abajo se dispara dentro de un .then(), después de que
// todos los <script> de la página ya hayan terminado de ejecutarse), pero
// mantenerlo al final deja claro que este es el punto de arranque real.

window.electronAPI.getConfig().then(async (cfg) => {
    const lang = (cfg && cfg.language) || 'es';
    languageSelect.value = lang;
    setLanguage(lang);
    applyColorTheme((cfg && cfg.colorTheme) || 'ember');

    if (cfg && cfg.account) {
        renderAccount(cfg.account);
        showScreen('mainScreen');
    } else {
        showScreen('loginScreen');
    }

    if (cfg && cfg.curseforgeApiKey) {
        curseforgeApiKeyInput.value = cfg.curseforgeApiKey;
    }

    if (cfg && cfg.activeModpack) {
        document.getElementById('mainScreen').dataset.modpackActive = '1';
        updateActiveModpackLabel(cfg.activeModpack);
    } else {
        updateActiveModpackLabel(null);
    }

    await applyTargetSettings(cfg && cfg.activeModpack ? cfg.activeModpack.id : null);
});
