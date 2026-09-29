// Smoke test de extremo a extremo: abre la app de verdad (Electron) con
// Playwright y recorre lo básico sin necesitar red. Se ejecuta con
// `npm run test:e2e` (en Linux, bajo xvfb-run; ver .github/workflows/ci.yml).
//
// Usa una carpeta de configuración temporal (XDG_CONFIG_HOME) para no tocar
// la config ni las instancias reales de quien lo ejecute.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

const repoRoot = path.join(__dirname, '..');
const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-e2e-'));

let app;
let win;
const consoleErrors = [];

before(async () => {
    app = await electron.launch({
        args: [repoRoot, '--no-sandbox', '--disable-gpu'],
        cwd: repoRoot,
        env: { ...process.env, XDG_CONFIG_HOME: configHome, LANG: 'es_ES.UTF-8' },
        timeout: 60000
    });
    for (let i = 0; i < 150 && !win; i++) {
        win = app.windows().find((w) => w.url().endsWith('index.html'));
        if (!win) await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(win, 'no se abrió la ventana principal');
    win.on('pageerror', (err) => consoleErrors.push(err.message));
    await win.waitForLoadState('load');
    await win.waitForSelector('#loginScreen.active, #mainScreen.active');
});

after(async () => {
    if (app) await app.close();
    fs.rmSync(configHome, { recursive: true, force: true });
});

test('arranca en la pantalla de login con la API del preload y sin la de backend', async () => {
    const info = await win.evaluate(() => ({
        api: typeof window.electronAPI,
        setBackendUrl: typeof window.electronAPI.setBackendUrl,
        login: document.getElementById('loginScreen').classList.contains('active'),
        csp: Boolean(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))
    }));
    assert.deepEqual(info, { api: 'object', setBackendUrl: 'undefined', login: true, csp: true });
});

test('login offline lleva a la pantalla principal con Java automático', async () => {
    await win.fill('#offlineUsername', 'E2E');
    await win.click('#offlineLoginBtn');
    await win.waitForSelector('#mainScreen.active', { timeout: 60000 });
    const state = await win.evaluate(() => ({
        account: document.getElementById('accountName').innerText,
        java: document.getElementById('javaPath').value
    }));
    assert.equal(state.account, 'E2E');
    assert.equal(state.java, '', 'el campo de Java vacío significa automático');
});

test('la CSP bloquea código inyectado y la ventana no puede navegar ni abrir otras', async () => {
    const result = await win.evaluate(async () => {
        const probe = document.createElement('div');
        probe.innerHTML = '<img src="no-existe.png" onerror="window.__pwned = 1">';
        document.body.appendChild(probe);
        const opened = window.open('https://example.com');
        window.location.href = 'https://example.com';
        await new Promise((resolve) => setTimeout(resolve, 800));
        return { pwned: window.__pwned === 1, opened: opened !== null, href: window.location.href };
    });
    assert.equal(result.pwned, false);
    assert.equal(result.opened, false);
    assert.match(result.href, /index\.html$/);
});

test('servidores favoritos: añadir, rechazar una dirección inválida y quitar', async () => {
    const added = await win.evaluate(() => window.electronAPI.addFavoriteServer(null, 'Test', 'play.example.com'));
    assert.equal(added.length, 1);
    const error = await win.evaluate(() => window.electronAPI.addFavoriteServer(null, 'Malo', '--demo').catch((e) => e.message));
    assert.match(error, /no es válida/);
    const left = await win.evaluate((id) => window.electronAPI.removeFavoriteServer(null, id), added[0].id);
    assert.deepEqual(left, []);
});

test('no hay errores de JavaScript en la página', () => {
    assert.deepEqual(consoleErrors, []);
});
