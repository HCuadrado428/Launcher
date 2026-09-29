// Referencia compartida a la ventana principal. Varios módulos (backend,
// loaders, sincronización...) necesitan mandarle eventos de progreso o
// avisos sin depender de main.js directamente (evita requires circulares:
// main.js es quien los importa a ellos, no al revés).
let mainWindow = null;

function setMainWindow(win) {
    mainWindow = win;
}

function getMainWindow() {
    return mainWindow;
}

// Manda un evento a la ventana si sigue abierta; si no, se descarta sin más
// (p.ej. progreso de una descarga que termina mientras la app se cierra).
function sendToWindow(channel, payload) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

module.exports = { setMainWindow, getMainWindow, sendToWindow };
