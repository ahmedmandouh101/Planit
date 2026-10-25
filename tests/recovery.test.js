const { test } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');
const User = require('../model/userModel');

test('recovery validates requests and limits email and reset attempts together', async (context) => {
  context.mock.method(User, 'findOne', async () => null);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/users`;
  const request = (path, body, method = 'POST') => fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal((await request('/forgetPassword', {})).status, 400);
  assert.equal((await request('/forgetPassword', { email: 'not-an-email' })).status, 400);
  assert.equal((await request('/resetPassword/invalid', { password: 'Password-123', confirmPassword: 'Password-123' }, 'PATCH')).status, 400);
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const response = await request('/forgetPassword', { email: 'unknown@example.com' });
    assert.equal(response.status, 200);
    assert.match((await response.json()).message, /If an account exists/);
  }
  const limited = await request('/forgetPassword', { email: 'unknown@example.com' });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.match((await limited.json()).message, /15 minutes/);
  assert.equal((await request('/resetPassword/invalid', {}, 'PATCH')).status, 429);
});
