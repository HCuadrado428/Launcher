const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Cuentas
    getConfig: () => ipcRenderer.invoke('get-config'),
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
    onGameProgress: (callback) => ipcRenderer.on('game-progress', (_event, data) => callback(data))
});
