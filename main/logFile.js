const fs = require('fs');
const path = require('path');
const util = require('util');
const { redactSecrets } = require('./utils');

// ============================================================================
// LOG DEL LAUNCHER EN DISCO
// ============================================================================

// Todo lo que el proceso principal escribe con console.log/warn/error se
// guarda también en launcher.log, junto a los crash logs (se abre con el
// mismo botón "Abrir carpeta de logs"). Así, si algo falla fuera del juego
// (sincronizar, login, instalar Forge...), el jugador tiene algo que mandar.
// La salida del propio juego no se copia: ya va a la consola, a los crash
// logs y a logs/latest.log de Minecraft, y llenaría el archivo enseguida.
//
// Cuando launcher.log pasa de maxBytes se renombra a launcher.old.log y se
// empieza uno nuevo, así que nunca ocupa más de ~2 × maxBytes.
function installFileLogger(dir, { maxBytes = 5 * 1024 * 1024 } = {}) {
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'launcher.log');
    const oldPath = path.join(dir, 'launcher.old.log');

    // Se escribe de forma síncrona sobre un descriptor: así el archivo se
    // puede cerrar antes de renombrarlo al rotar (en Windows no se puede
    // renombrar un archivo abierto, y un stream lo cerraría más tarde).
    let fd = null;
    let bytesWritten = 0;

    const open = () => {
        try {
            bytesWritten = fs.statSync(filePath).size;
        } catch (err) {
            bytesWritten = 0;
        }
        try {
            fd = fs.openSync(filePath, 'a');
        } catch (err) {
            fd = null; // sin log en disco, pero la app sigue
        }
    };

    const closeFd = () => {
        if (fd === null) return;
        try { fs.closeSync(fd); } catch (err) { /* ya cerrado */ }
        fd = null;
    };

    const rotate = () => {
        closeFd();
        try { fs.renameSync(filePath, oldPath); } catch (err) { /* sin rotar: se sigue escribiendo */ }
        open();
    };

    open();
    if (bytesWritten > maxBytes) rotate();

    const format = (arg) => {
        if (arg instanceof Error) return arg.stack || arg.message;
        return typeof arg === 'string' ? arg : util.inspect(arg, { depth: 4, breakLength: Infinity });
    };

    const write = (level, args) => {
        const text = args.map(format).join(' ');
        if (text.startsWith('[GAME]')) return;
        const line = `${new Date().toISOString()} ${level} ${redactSecrets(text)}\n`;
        if (fd === null) return;
        // Un error de disco al escribir el log nunca debe tumbar la app.
        try { fs.writeSync(fd, line); } catch (err) { return; }
        bytesWritten += Buffer.byteLength(line);
        if (bytesWritten > maxBytes) rotate();
    };

    const originals = {};
    for (const [method, level] of [['log', 'INFO'], ['warn', 'WARN'], ['error', 'ERROR']]) {
        originals[method] = console[method];
        console[method] = (...args) => {
            originals[method].apply(console, args);
            write(level, args);
        };
    }

    // Solo se observan (no cambian lo que haría Electron con ellos).
    const onException = (err) => write('FATAL', ['[uncaughtException]', err]);
    const onRejection = (reason) => write('ERROR', ['[unhandledRejection]', reason]);
    process.on('uncaughtExceptionMonitor', onException);
    process.on('unhandledRejection', onRejection);

    return {
        filePath,
        close() {
            Object.assign(console, originals);
            process.off('uncaughtExceptionMonitor', onException);
            process.off('unhandledRejection', onRejection);
            closeFd();
            return Promise.resolve();
        }
    };
}

module.exports = { installFileLogger };
