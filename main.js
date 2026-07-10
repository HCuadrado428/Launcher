const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { Client, Authenticator } = require('minecraft-launcher-core');
const launcher = new Client();

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

ipcMain.on('launch-game', (event, username) => {
    let opts = {
        clientPackage: null,
        authorization: Authenticator.getAuth(username), // Modo No-Premium / Offline
        root: path.join(app.getPath('appData'), '.milauncher'), // Carpeta donde se guarda el juego
        javapath: "C:\Program Files\Java\jdk-26.0.1\bin", // Tu ruta exacta de Java 26
        skipVersionCheck: true, // Salta la verificación global para evitar crasheos
        version: {
            number: "1.20.1", // Versión que va a abrir
            type: "release"
        },
        memory: {
            max: "4G", // Memoria RAM máxima asignada
            min: "2G"
        }
    };

    launcher.launch(opts);

    // Muestra logs en la consola de VS Code para monitorear el juego
    launcher.on('debug', (e) => console.log(`[DEBUG] ${e}`));
    launcher.on('data', (e) => console.log(`[GAME] ${e}`));
});
