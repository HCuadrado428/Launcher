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

    // Juego
    launchGame: (data) => ipcRenderer.send('launch-game', data),
    stopGame: () => ipcRenderer.send('stop-game'),
    onGameStatus: (callback) => ipcRenderer.on('game-status', (_event, data) => callback(data)),
    onGameProgress: (callback) => ipcRenderer.on('game-progress', (_event, data) => callback(data)),

    // Modpacks
    createModpack: (name, mcVersion) => ipcRenderer.invoke('modpacks-create', { name, mcVersion }),
    getMyModpacks: () => ipcRenderer.invoke('modpacks-mine'),
    getModpackManifest: (id) => ipcRenderer.invoke('modpacks-manifest', { id }),
    addModToModpack: (id) => ipcRenderer.invoke('modpacks-add-mod', { id }),
    removeModFromModpack: (id, modId) => ipcRenderer.invoke('modpacks-remove-mod', { id, modId }),
    createInvite: (id, maxUses, expiresHours) => ipcRenderer.invoke('modpacks-create-invite', { id, maxUses, expiresHours }),
    redeemInvite: (token) => ipcRenderer.invoke('modpacks-redeem-invite', { token }),
    syncModpack: (id) => ipcRenderer.invoke('modpacks-sync', { id }),
    selectActiveModpack: (id, name, mcVersion) => ipcRenderer.invoke('modpacks-select', { id, name, mcVersion }),
    onInviteReceived: (callback) => ipcRenderer.on('invite-received', (_event, data) => callback(data)),
    onModpackSyncProgress: (callback) => ipcRenderer.on('modpack-sync-progress', (_event, data) => callback(data))
});
