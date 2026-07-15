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

module.exports = { setMainWindow, getMainWindow };
