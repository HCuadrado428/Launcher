// Renovación del token de Minecraft (cuentas Microsoft) antes de jugar.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { needsRefresh, ensureFreshMinecraftAuth } = require('../main/msAuth');

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;
const authWith = (meta) => ({ access_token: 'viejo', uuid: 'u', name: 'Steve', meta: { type: 'msa', ...meta } });

class FakeAuth {
    constructor(prompt) { this.prompt = prompt; }
    async refresh(refreshToken) {
        FakeAuth.lastRefreshToken = refreshToken;
        if (FakeAuth.fail) throw new Error('sin red');
        return {
            getMinecraft: async () => ({
                mclc: (refreshable) => authWith({ exp: NOW + 23 * HOUR, refresh: refreshable ? 'refresh-nuevo' : undefined, rotated: true })
            })
        };
    }
}

test('needsRefresh: caducado, a punto de caducar o sin fecha', () => {
    assert.equal(needsRefresh(authWith({ exp: NOW + 5 * HOUR }), NOW), false);
    assert.equal(needsRefresh(authWith({ exp: NOW + 60 * 1000 }), NOW), true);
    assert.equal(needsRefresh(authWith({ exp: NOW - HOUR }), NOW), true);
    assert.equal(needsRefresh(authWith({}), NOW), true);
});

test('un token válido se usa tal cual, sin llamar a Microsoft', async () => {
    FakeAuth.lastRefreshToken = null;
    const auth = authWith({ exp: NOW + 5 * HOUR, refresh: 'r' });
    const result = await ensureFreshMinecraftAuth(auth, FakeAuth, NOW);
    assert.deepEqual(result, { auth, refreshed: false, expired: false });
    assert.equal(FakeAuth.lastRefreshToken, null);
});

test('un token caducado con refresh token se renueva y conserva el nuevo refresh', async () => {
    FakeAuth.fail = false;
    const result = await ensureFreshMinecraftAuth(authWith({ exp: NOW - HOUR, refresh: 'refresh-viejo' }), FakeAuth, NOW);
    assert.equal(FakeAuth.lastRefreshToken, 'refresh-viejo');
    assert.equal(result.refreshed, true);
    assert.equal(result.expired, false);
    assert.equal(result.auth.meta.refresh, 'refresh-nuevo');
});

test('si no se puede renovar se marca como caducado pero se devuelve el token para jugar en local', async () => {
    const sinRefresh = authWith({ exp: NOW - HOUR });
    assert.deepEqual(await ensureFreshMinecraftAuth(sinRefresh, FakeAuth, NOW), { auth: sinRefresh, refreshed: false, expired: true });

    FakeAuth.fail = true;
    const conRefresh = authWith({ exp: NOW - HOUR, refresh: 'r' });
    const result = await ensureFreshMinecraftAuth(conRefresh, FakeAuth, NOW);
    assert.equal(result.expired, true);
    assert.equal(result.auth, conRefresh);
    FakeAuth.fail = false;

    assert.equal((await ensureFreshMinecraftAuth(conRefresh, null, NOW)).expired, true, 'sin msmc instalado');
});
