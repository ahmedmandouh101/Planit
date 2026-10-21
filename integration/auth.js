const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const User = require('../model/userModel');
const Email = require('../utils/email');
const app = require('../app');

let server;
let baseUrl;
let createdUserId;

before(async () => {
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  process.env.JWT_SECRET_EXPIRES_IN = '1h';
  process.env.JWT_COOKIE_EXPIRES_IN = '1';
  await mongoose.connect('mongodb://127.0.0.1:27017/planit_test', { serverSelectionTimeoutMS: 5000 });
  await User.init();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  try {
    if (createdUserId) await User.deleteOne({ _id: createdUserId });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
});

test('real MongoDB signup, password hashing, login, and protected profile', async (context) => {
  context.mock.method(Email.prototype, 'sendWelcome', async () => {});
  const email = `integration-${crypto.randomUUID()}@example.com`;
  const password = 'Integration-password-123';
  const send = (route, body) => fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const signup = await send('/api/v1/users/signup', {
    name: 'Integration User', email, password, confirmPassword: password, role: 'admin',
  });
  const signupBody = await signup.json();
  const stored = await User.findOne({ email }).select('+password');
  createdUserId = stored && stored.id;
  assert.equal(signup.status, 201);
  assert.ok(stored);
  assert.equal(stored.role, 'user');
  assert.notEqual(stored.password, password);
  assert.equal(await stored.correctPassword(password, stored.password), true);
  assert.equal(signupBody.data.user.password, undefined);
  assert.equal((await send('/api/v1/users/login', { email, password: 'incorrect' })).status, 401);
  const login = await send('/api/v1/users/login', { email, password });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const profile = await fetch(`${baseUrl}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(profile.status, 200);
  const profileBody = await profile.json();
  assert.equal(profileBody.data.data.email, email);
  assert.equal(profileBody.data.data.password, undefined);
  assert.equal((await fetch(`${baseUrl}/health/ready`)).status, 200);
});
