const { contextBridge, ipcRenderer } = require('electron');

// Electron antepone "Error invoking remote method '<canal>': Error: " a
// cualquier error lanzado desde un ipcMain.handle. Ese prefijo acababa tal
// cual en los avisos de la interfaz; se quita para dejar solo el mensaje
// (ya traducido) del proceso principal.
const REMOTE_ERROR_PREFIX_RE = /^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/;

function invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args).catch((err) => {
        throw new Error(String((err && err.message) || err).replace(REMOTE_ERROR_PREFIX_RE, ''));
    });
}

contextBridge.exposeInMainWorld('electronAPI', {
    // Config general
    getConfig: () => invoke('get-config'),
    getTargetSettings: (modpackId) => invoke('get-target-settings', { modpackId }),
    getSystemMemory: () => invoke('get-system-memory'),
    getSkinRender: (uuid) => invoke('get-skin-render', { uuid }),
    checkBackendStatus: () => invoke('check-backend-status'),

    // Cuentas
    loginOffline: (username) => invoke('login-offline', username),
    loginMicrosoft: () => invoke('login-microsoft'),
    logout: () => invoke('logout'),
    getAccounts: () => invoke('get-accounts'),
    switchAccount: (id) => invoke('switch-account', { id }),
    removeAccount: (id) => invoke('remove-account', { id }),

    // Java
    selectJavaPath: () => invoke('select-java-path'),
    autoDetectJava: () => invoke('auto-detect-java'),

    // Versión de Minecraft
    getLatestVersion: () => invoke('get-latest-mc-version'),
    getReleaseVersions: () => invoke('get-release-versions'),

    // Versiones de loader (Forge/Fabric)
    getLoaderVersions: (loader, mcVersion) => invoke('get-loader-versions', { loader, mcVersion }),

    // Idioma
    setLanguage: (lang) => invoke('set-language', lang),

    // Tema de color
    setColorTheme: (theme) => invoke('set-color-theme', theme),

    // Horas jugadas
    getPlaytime: (modpackId) => invoke('get-playtime', { modpackId }),

    // CurseForge (preparado, todavía no activo)
    setCurseForgeApiKey: (apiKey) => invoke('set-curseforge-api-key', apiKey),

    // Actualizaciones
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, data) => callback(data)),
    downloadUpdate: () => ipcRenderer.send('download-update'),
    restartAndUpdate: () => ipcRenderer.send('restart-and-update'),
    getAppVersion: () => invoke('get-app-version'),
    checkForUpdates: () => invoke('check-for-updates'),

    // Juego
    launchGame: (data) => ipcRenderer.send('launch-game', data),
    stopGame: () => ipcRenderer.send('stop-game'),
    onGameStatus: (callback) => ipcRenderer.on('game-status', (_event, data) => callback(data)),
    onGameProgress: (callback) => ipcRenderer.on('game-progress', (_event, data) => callback(data)),
    onGameLog: (callback) => ipcRenderer.on('game-log', (_event, line) => callback(line)),
    openCrashLogsFolder: () => invoke('open-crash-logs-folder'),
    openLastCrashLog: () => invoke('open-last-crash-log'),
    openInstanceFolder: (id) => invoke('open-instance-folder', { id }),
    exportSaves: (id, name) => invoke('export-saves', { id, name }),
    listScreenshots: (id) => invoke('list-screenshots', { id }),
    openScreenshot: (id, filename) => invoke('open-screenshot', { id, filename }),
    deleteScreenshot: (id, filename) => invoke('delete-screenshot', { id, filename }),

    // Modpacks
    createModpack: (name, mcVersion, loader, loaderVersion) => invoke('modpacks-create', { name, mcVersion, loader, loaderVersion }),
    deleteModpack: (id) => invoke('modpacks-delete', { id }),
    getMyModpacks: () => invoke('modpacks-mine'),
    getModpackManifest: (id) => invoke('modpacks-manifest', { id }),
    checkModpackHealth: (id) => invoke('modpacks-check-health', { id }),
    addModToModpack: (id, type) => invoke('modpacks-add-mod', { id, type }),
    removeModFromModpack: (id, modId) => invoke('modpacks-remove-mod', { id, modId }),
    searchModrinth: (query, mcVersion, loader, projectType) => invoke('search-modrinth', { query, mcVersion, loader, projectType }),
    addModFromModrinth: (id, projectId, mcVersion, loader, projectType) => invoke('add-mod-from-modrinth', { id, projectId, mcVersion, loader, projectType }),
    scanLocalModpacks: () => invoke('scan-local-modpacks'),
    importLocalModpack: (instancePath) => invoke('import-local-modpack', { instancePath }),
    createInvite: (id, maxUses, expiresHours) => invoke('modpacks-create-invite', { id, maxUses, expiresHours }),
    redeemInvite: (token) => invoke('modpacks-redeem-invite', { token }),
    syncModpack: (id) => invoke('modpacks-sync', { id }),
    repairModpack: (id) => invoke('modpacks-repair', { id }),
    verifyModpackFiles: (id) => invoke('modpacks-verify-files', { id }),
    exportModpack: (id, name) => invoke('modpacks-export', { id, name }),
    exportModpackMrpack: (id, name) => invoke('modpacks-export-mrpack', { id, name }),
    importMrpack: () => invoke('import-mrpack'),
    setModpackCover: (id) => invoke('modpacks-set-cover', { id }),
    shareModpackConfig: (id) => invoke('modpacks-share-config', { id }),
    removeSharedConfig: (id) => invoke('modpacks-remove-config', { id }),
    getFavoriteServers: (id) => invoke('get-favorite-servers', { id }),
    addFavoriteServer: (id, name, address) => invoke('add-favorite-server', { id, name, address }),
    removeFavoriteServer: (id, serverId) => invoke('remove-favorite-server', { id, serverId }),
    selectActiveModpack: (id, name, mcVersion, loader, loaderVersion) => invoke('modpacks-select', { id, name, mcVersion, loader, loaderVersion }),
    onInviteReceived: (callback) => ipcRenderer.on('invite-received', (_event, data) => callback(data)),
    // Se registra un listener nuevo cada vez que se llama, así que a
    // diferencia de los demás "on..." (que se suscriben una sola vez al
    // arrancar) este SÍ hay que poder des-suscribirlo: se llama en cada
    // sincronización/reparación/verificación, y sin forma de quitarlo se
    // iban acumulando listeners duplicados en cada uso durante la sesión.
    onModpackSyncProgress: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on('modpack-sync-progress', listener);
        return () => ipcRenderer.removeListener('modpack-sync-progress', listener);
    },
    onModpackDownloadEstimate: (callback) => ipcRenderer.on('modpack-download-estimate', (_event, data) => callback(data)),
    checkModUpdate: (id, modId) => invoke('modpacks-check-mod-update', { id, modId }),
    updateMod: (id, modId, mcVersion, loader) => invoke('modpacks-update-mod', { id, modId, mcVersion, loader }),
    addModrinthDependencies: (id, projectIds, mcVersion, loader) => invoke('add-modrinth-dependencies', { id, projectIds, mcVersion, loader }),

    // Invitaciones y acceso (solo el dueño puede usarlas de verdad; el
    // backend las rechaza igualmente si no lo es)
    listInvites: (id) => invoke('modpacks-list-invites', { id }),
    revokeInvite: (id, token) => invoke('modpacks-revoke-invite', { id, token }),
    listModpackAccess: (id) => invoke('modpacks-list-access', { id }),
    revokeModpackAccess: (id, uuid) => invoke('modpacks-revoke-access', { id, uuid }),

    // Historial de versiones (solo el dueño)
    listModpackVersions: (id) => invoke('modpacks-list-versions', { id }),
    restoreModpackVersion: (id, versionId) => invoke('modpacks-restore-version', { id, versionId }),

    // Mods opcionales: elección local del jugador, por modpack
    getOptionalModChoices: (id) => invoke('get-optional-mod-choices', { id }),
    setOptionalModChoice: (id, modId, included) => invoke('set-optional-mod-choice', { id, modId, included }),

    // Uso de almacenamiento y abandonar un modpack compartido
    getStorageUsage: () => invoke('get-storage-usage'),
    leaveModpack: (id) => invoke('modpacks-leave', { id }),

    // Se dispara cuando el backend responde 401 (JWT de 30 días caducado o
    // inválido) a cualquier petición autenticada. onGameStatus etc. se
    // suscriben una sola vez al arrancar, así que basta con un listener fijo
    // aquí igual que con ellos.
    onSessionExpired: (callback) => ipcRenderer.on('session-expired', () => callback())
});
