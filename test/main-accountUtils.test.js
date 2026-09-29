// Lo que el renderer ve de cada cuenta guardada (nunca tokens) y cómo se
// actualiza la lista al volver a iniciar sesión con la misma identidad.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { upsertAccount, toPublicAccount } = require('../main/accountUtils');

test('toPublicAccount no expone tokens y calcula "premium"', () => {
    const ms = { id: 'ms:1', type: 'microsoft', username: 'Steve', uuid: 'u1', auth: { access_token: 'secreto' }, session: { token: 'jwt', premium: true } };
    const pub = toPublicAccount(ms);
    assert.deepEqual(pub, { id: 'ms:1', type: 'microsoft', username: 'Steve', uuid: 'u1', premium: true });
    assert.ok(!JSON.stringify(pub).includes('secreto'));
    assert.ok(!JSON.stringify(pub).includes('jwt'));

    // Sesiones antiguas sin "premium": una cuenta Microsoft sigue siendo premium.
    assert.equal(toPublicAccount({ ...ms, session: { token: 'jwt' } }).premium, true);
    assert.equal(toPublicAccount({ id: 'offline:alex', type: 'offline', username: 'Alex', session: { premium: false } }).premium, false);
    assert.equal(toPublicAccount({ id: 'offline:alex', type: 'offline', username: 'Alex', session: null }).premium, false);
});

test('upsertAccount reemplaza la cuenta con el mismo id en vez de duplicarla', () => {
    const list = upsertAccount([{ id: 'a', username: 'viejo' }, { id: 'b' }], { id: 'a', username: 'nuevo' });
    assert.deepEqual(list, [{ id: 'b' }, { id: 'a', username: 'nuevo' }]);
});
