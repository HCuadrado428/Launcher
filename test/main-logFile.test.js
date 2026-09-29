// launcher.log: copia en disco de los console.* del proceso principal.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { installFileLogger } = require('../main/logFile');

function silenceConsole() {
    const saved = { log: console.log, warn: console.warn, error: console.error };
    console.log = console.warn = console.error = () => {};
    return () => Object.assign(console, saved);
}

test('guarda log/warn/error con nivel, tapa secretos y omite la salida del juego', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-log-'));
    const restore = silenceConsole();
    const logger = installFileLogger(dir);
    try {
        console.log('[START] hola');
        console.warn('[WARN] cuidado', { a: 1 });
        console.error('[ERROR] fallo', new Error('boom'));
        console.log('[DEBUG] args --accessToken secreto123 --version 1.21');
        console.log('[GAME] línea del juego');
    } finally {
        await logger.close();
        restore();
    }
    const text = fs.readFileSync(path.join(dir, 'launcher.log'), 'utf-8');
    assert.match(text, /INFO \[START\] hola/);
    assert.match(text, /WARN \[WARN\] cuidado \{ a: 1 \}/);
    assert.match(text, /ERROR \[ERROR\] fallo Error: boom/);
    assert.ok(!text.includes('secreto123'));
    assert.ok(!text.includes('línea del juego'));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('rota el archivo al pasar del tamaño máximo', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-log-'));
    const restore = silenceConsole();
    const logger = installFileLogger(dir, { maxBytes: 2000 });
    try {
        for (let i = 0; i < 100; i++) console.log(`[INFO] línea número ${i} con algo de texto de relleno`);
    } finally {
        await logger.close();
        restore();
    }
    assert.ok(fs.existsSync(path.join(dir, 'launcher.old.log')));
    assert.ok(fs.statSync(path.join(dir, 'launcher.log')).size <= 2200);
    assert.match(fs.readFileSync(path.join(dir, 'launcher.log'), 'utf-8'), /línea número 99/);
    fs.rmSync(dir, { recursive: true, force: true });
});
