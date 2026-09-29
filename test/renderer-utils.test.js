// renderer/utils.js es un <script> clásico (sin módulos): se carga en un
// contexto de vm aparte y se leen de ahí sus funciones globales. Cubre lo
// que decide qué texto del servidor llega a innerHTML o a un src.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'renderer', 'utils.js'), 'utf-8'), context);
const { escapeHtml, safeDataImageUri, extractInviteToken } = context;

test('escapeHtml neutraliza los caracteres especiales de HTML', () => {
    assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    assert.equal(escapeHtml("a & 'b'"), 'a &amp; &#39;b&#39;');
    assert.equal(escapeHtml(42), '42');
    assert.equal(escapeHtml(null), '');
});

test('safeDataImageUri solo acepta imágenes en base64', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    assert.equal(safeDataImageUri(png), png);
    assert.equal(safeDataImageUri('data:image/webp;base64,AAAA'), 'data:image/webp;base64,AAAA');
    for (const bad of [
        'x" onerror="alert(1)',
        'data:image/png;base64,AAAA" onerror="alert(1)',
        'data:image/svg+xml;base64,PHN2Zz4=',
        'data:text/html;base64,PHNjcmlwdD4=',
        'javascript:alert(1)',
        'https://example.com/cover.png',
        '',
        null
    ]) {
        assert.equal(safeDataImageUri(bad), null, `debería rechazar ${JSON.stringify(bad)}`);
    }
});

test('extractInviteToken saca el token de un link completo o lo deja tal cual', () => {
    assert.equal(extractInviteToken('  milauncher://invite/abc123  '), 'abc123');
    assert.equal(extractInviteToken('milauncher://invite/abc123/'), 'abc123');
    assert.equal(extractInviteToken('milauncher://invite/abc%2D123'), 'abc-123');
    assert.equal(extractInviteToken('abc123'), 'abc123');
});
