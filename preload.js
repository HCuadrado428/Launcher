const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Config general
    getConfig: () => ipcRenderer.invoke('get-config'),
    getTargetSettings: (modpackId) => ipcRenderer.invoke('get-target-settings', { modpackId }),
    getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
    setBackendUrl: (url) => ipcRenderer.invoke('set-backend-url', url),
    getSystemMemory: () => ipcRenderer.invoke('get-system-memory'),
    getSkinRender: (uuid) => ipcRenderer.invoke('get-skin-render', { uuid }),
    checkBackendStatus: () => ipcRenderer.invoke('check-backend-status'),

    // Cuentas
    loginOffline: (username) => ipcRenderer.invoke('login-offline', username),
    loginMicrosoft: () => ipcRenderer.invoke('login-microsoft'),
    logout: () => ipcRenderer.invoke('logout'),
    getAccounts: () => ipcRenderer.invoke('get-accounts'),
    switchAccount: (id) => ipcRenderer.invoke('switch-account', { id }),
    removeAccount: (id) => ipcRenderer.invoke('remove-account', { id }),

    // Java
    selectJavaPath: () => ipcRenderer.invoke('select-java-path'),
    autoDetectJava: () => ipcRenderer.invoke('auto-detect-java'),

    // Versión de Minecraft
    getLatestVersion: () => ipcRenderer.invoke('get-latest-mc-version'),
    getReleaseVersions: () => ipcRenderer.invoke('get-release-versions'),

    // Versiones de loader (Forge/Fabric)
    getForgeVersions: (mcVersion) => ipcRenderer.invoke('get-forge-versions', { mcVersion }),
    getFabricVersions: (mcVersion) => ipcRenderer.invoke('get-fabric-versions', { mcVersion }),

    // Idioma
    setLanguage: (lang) => ipcRenderer.invoke('set-language', lang),

    // Tema de color
    setColorTheme: (theme) => ipcRenderer.invoke('set-color-theme', theme),

    // Horas jugadas
    getPlaytime: (modpackId) => ipcRenderer.invoke('get-playtime', { modpackId }),

    // CurseForge (preparado, todavía no activo)
    setCurseForgeApiKey: (apiKey) => ipcRenderer.invoke('set-curseforge-api-key', apiKey),

    // Actualizaciones
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, data) => callback(data)),
    downloadUpdate: () => ipcRenderer.send('download-update'),
    restartAndUpdate: () => ipcRenderer.send('restart-and-update'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

    // Juego
    launchGame: (data) => ipcRenderer.send('launch-game', data),
    stopGame: () => ipcRenderer.send('stop-game'),
    onGameStatus: (callback) => ipcRenderer.on('game-status', (_event, data) => callback(data)),
    onGameProgress: (callback) => ipcRenderer.on('game-progress', (_event, data) => callback(data)),
    onGameLog: (callback) => ipcRenderer.on('game-log', (_event, line) => callback(line)),
    openCrashLogsFolder: () => ipcRenderer.invoke('open-crash-logs-folder'),

    // Modpacks
    createModpack: (name, mcVersion, loader, loaderVersion) => ipcRenderer.invoke('modpacks-create', { name, mcVersion, loader, loaderVersion }),
    deleteModpack: (id) => ipcRenderer.invoke('modpacks-delete', { id }),
    getMyModpacks: () => ipcRenderer.invoke('modpacks-mine'),
    getModpackManifest: (id) => ipcRenderer.invoke('modpacks-manifest', { id }),
    checkModpackHealth: (id) => ipcRenderer.invoke('modpacks-check-health', { id }),
    addModToModpack: (id, type) => ipcRenderer.invoke('modpacks-add-mod', { id, type }),
    removeModFromModpack: (id, modId) => ipcRenderer.invoke('modpacks-remove-mod', { id, modId }),
    searchModrinth: (query, mcVersion, loader, projectType) => ipcRenderer.invoke('search-modrinth', { query, mcVersion, loader, projectType }),
    addModFromModrinth: (id, projectId, mcVersion, loader, projectType) => ipcRenderer.invoke('add-mod-from-modrinth', { id, projectId, mcVersion, loader, projectType }),
    scanLocalModpacks: () => ipcRenderer.invoke('scan-local-modpacks'),
    importLocalModpack: (instancePath) => ipcRenderer.invoke('import-local-modpack', { instancePath }),
    createInvite: (id, maxUses, expiresHours) => ipcRenderer.invoke('modpacks-create-invite', { id, maxUses, expiresHours }),
    redeemInvite: (token) => ipcRenderer.invoke('modpacks-redeem-invite', { token }),
    syncModpack: (id) => ipcRenderer.invoke('modpacks-sync', { id }),
    repairModpack: (id) => ipcRenderer.invoke('modpacks-repair', { id }),
    verifyModpackFiles: (id) => ipcRenderer.invoke('modpacks-verify-files', { id }),
    exportModpack: (id, name) => ipcRenderer.invoke('modpacks-export', { id, name }),
    setModpackCover: (id) => ipcRenderer.invoke('modpacks-set-cover', { id }),
    selectActiveModpack: (id, name, mcVersion, loader, loaderVersion) => ipcRenderer.invoke('modpacks-select', { id, name, mcVersion, loader, loaderVersion }),
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
    checkModUpdate: (id, modId) => ipcRenderer.invoke('modpacks-check-mod-update', { id, modId }),

    // Invitaciones y acceso (solo el dueño puede usarlas de verdad; el
    // backend las rechaza igualmente si no lo es)
    listInvites: (id) => ipcRenderer.invoke('modpacks-list-invites', { id }),
    revokeInvite: (id, token) => ipcRenderer.invoke('modpacks-revoke-invite', { id, token }),
    listModpackAccess: (id) => ipcRenderer.invoke('modpacks-list-access', { id }),
    revokeModpackAccess: (id, uuid) => ipcRenderer.invoke('modpacks-revoke-access', { id, uuid }),

    // Historial de versiones (solo el dueño)
    listModpackVersions: (id) => ipcRenderer.invoke('modpacks-list-versions', { id }),
    restoreModpackVersion: (id, versionId) => ipcRenderer.invoke('modpacks-restore-version', { id, versionId }),

    // Mods opcionales: elección local del jugador, por modpack
    getOptionalModChoices: (id) => ipcRenderer.invoke('get-optional-mod-choices', { id }),
    setOptionalModChoice: (id, modId, included) => ipcRenderer.invoke('set-optional-mod-choice', { id, modId, included }),

    // Se dispara cuando el backend responde 401 (JWT de 30 días caducado o
    // inválido) a cualquier petición autenticada. onGameStatus etc. se
    // suscriben una sola vez al arrancar, así que basta con un listener fijo
    // aquí igual que con ellos.
    onSessionExpired: (callback) => ipcRenderer.on('session-expired', () => callback())
});
