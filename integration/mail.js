const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const User = require('../model/userModel');

let server;
let baseUrl;
let createdUserId;

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test', JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    JWT_SECRET_EXPIRES_IN: '1h', JWT_COOKIE_EXPIRES_IN: '1',
    EMAIL_HOST: '127.0.0.1', EMAIL_PORT: '1025', EMAIL_SECURE: 'false',
    EMAIL_USERNAME: '', EMAIL_PASSWORD: '', EMAIL_FROM: 'hello@example.com',
  });
  await mongoose.connect('mongodb://127.0.0.1:27017/planit_test', { serverSelectionTimeoutMS: 5000 });
  await User.init();
  server = require('../app').listen(0, '127.0.0.1');
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

test('signup and password reset deliver real SMTP messages to Mailpit', async () => {
  const email = `mail-${crypto.randomUUID()}@example.com`;
  const password = 'Original-password-123';
  const newPassword = 'Replacement-password-456';
  const request = (route, body, method = 'POST') => fetch(`${baseUrl}${route}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const signup = await request('/api/v1/users/signup', {
    name: 'Mail Test User', email, password, confirmPassword: password,
  });
  const stored = await User.findOne({ email });
  createdUserId = stored && stored.id;
  assert.equal(signup.status, 201);
  assert.equal((await request('/api/v1/users/forgetPassword', { email })).status, 200);

  const inboxResponse = await fetch('http://127.0.0.1:8025/api/v1/messages', { signal: AbortSignal.timeout(5000) });
  assert.equal(inboxResponse.status, 200);
  const inbox = await inboxResponse.json();
  const messages = inbox.messages.filter((message) => message.To.some((recipient) => recipient.Address === email));
  assert.ok(messages.some((message) => message.Subject === 'Welcome to Planit!'));
  const resetMessage = messages.find((message) => message.Subject.includes('password reset'));
  assert.ok(resetMessage);
  const messageResponse = await fetch(`http://127.0.0.1:8025/api/v1/message/${resetMessage.ID}`);
  const message = await messageResponse.json();
  const resetPath = message.Text.match(/\/api\/v1\/users\/resetPassword\/[a-f0-9]{64}/);
  assert.ok(resetPath);
  const reset = await request(resetPath[0], { password: newPassword, confirmPassword: newPassword }, 'PATCH');
  assert.equal(reset.status, 200);
  assert.equal((await request('/api/v1/users/login', { email, password })).status, 401);
  assert.equal((await request('/api/v1/users/login', { email, password: newPassword })).status, 200);
  assert.equal((await request(resetPath[0], { password, confirmPassword: password }, 'PATCH')).status, 400);
});
