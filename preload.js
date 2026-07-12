const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Config general
    getConfig: () => ipcRenderer.invoke('get-config'),
    getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
    setBackendUrl: (url) => ipcRenderer.invoke('set-backend-url', url),

    // Cuentas
    loginOffline: (username) => ipcRenderer.invoke('login-offline', username),
    loginMicrosoft: () => ipcRenderer.invoke('login-microsoft'),
    logout: () => ipcRenderer.invoke('logout'),

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

    // Modpacks
    createModpack: (name, mcVersion, loader, loaderVersion) => ipcRenderer.invoke('modpacks-create', { name, mcVersion, loader, loaderVersion }),
    deleteModpack: (id) => ipcRenderer.invoke('modpacks-delete', { id }),
    getMyModpacks: () => ipcRenderer.invoke('modpacks-mine'),
    getModpackManifest: (id) => ipcRenderer.invoke('modpacks-manifest', { id }),
    addModToModpack: (id, type) => ipcRenderer.invoke('modpacks-add-mod', { id, type }),
    removeModFromModpack: (id, modId) => ipcRenderer.invoke('modpacks-remove-mod', { id, modId }),
    searchModrinth: (query, mcVersion, loader, projectType) => ipcRenderer.invoke('search-modrinth', { query, mcVersion, loader, projectType }),
    addModFromModrinth: (id, projectId, mcVersion, loader, projectType) => ipcRenderer.invoke('add-mod-from-modrinth', { id, projectId, mcVersion, loader, projectType }),
    scanLocalModpacks: () => ipcRenderer.invoke('scan-local-modpacks'),
    importLocalModpack: (instancePath) => ipcRenderer.invoke('import-local-modpack', { instancePath }),
    createInvite: (id, maxUses, expiresHours) => ipcRenderer.invoke('modpacks-create-invite', { id, maxUses, expiresHours }),
    redeemInvite: (token) => ipcRenderer.invoke('modpacks-redeem-invite', { token }),
    syncModpack: (id) => ipcRenderer.invoke('modpacks-sync', { id }),
    selectActiveModpack: (id, name, mcVersion, loader, loaderVersion) => ipcRenderer.invoke('modpacks-select', { id, name, mcVersion, loader, loaderVersion }),
    onInviteReceived: (callback) => ipcRenderer.on('invite-received', (_event, data) => callback(data)),
    onModpackSyncProgress: (callback) => ipcRenderer.on('modpack-sync-progress', (_event, data) => callback(data))
});
