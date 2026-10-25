const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const User = require('../model/userModel');
const Email = require('../utils/email');
const app = require('../app');
const Tour = require('../model/tourModel');

let server;
let baseUrl;
let createdUserId;
let secondUserId;
let createdTourId;

before(async () => {
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  process.env.JWT_SECRET_EXPIRES_IN = '1h';
  process.env.JWT_COOKIE_EXPIRES_IN = '1';
  await mongoose.connect('mongodb://127.0.0.1:27018/planit_test?replicaSet=planit-rs', { serverSelectionTimeoutMS: 5000 });
  await User.init();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  try {
    if (createdUserId) await User.deleteOne({ _id: createdUserId });
    if (secondUserId) await User.deleteOne({ _id: secondUserId });
    if (createdTourId) await Tour.deleteOne({ _id: createdTourId });
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
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(login.headers.get('set-cookie'), /SameSite=Strict/i);
  const cookieProfile = await fetch(`${baseUrl}/api/v1/users/me`, { headers: { Cookie: cookie } });
  assert.equal(cookieProfile.status, 200);
  const tour = await Tour.create({ ...require('../data/demo').tours[0], name: `Integration ${crypto.randomUUID().slice(0, 20)}` });
  createdTourId = tour.id;
  const savedUrl = `${baseUrl}/api/v1/users/saved-tours`;
  assert.equal((await fetch(savedUrl)).status, 401);
  const save = () => fetch(`${savedUrl}/${tour.id}`, { method: 'PUT', headers: { Cookie: cookie } });
  assert.equal((await save()).status, 200);
  assert.equal((await save()).status, 200);
  const favorites = await (await fetch(savedUrl, { headers: { Cookie: cookie } })).json();
  assert.deepEqual(favorites.data.tours.map((saved) => saved._id), [tour.id]);
  const second = await User.create({ name: 'Other User', email: `other-${crypto.randomUUID()}@example.com`, password, confirmPassword: password });
  secondUserId = second.id;
  const secondLogin = await send('/api/v1/users/login', { email: second.email, password });
  const secondCookie = secondLogin.headers.get('set-cookie').split(';')[0];
  const otherFavorites = await (await fetch(savedUrl, { headers: { Cookie: secondCookie } })).json();
  assert.deepEqual(otherFavorites.data.tours, []);
  assert.equal((await fetch(`${savedUrl}/invalid`, { method: 'PUT', headers: { Cookie: cookie } })).status, 400);
  assert.equal((await fetch(`${savedUrl}/${new mongoose.Types.ObjectId()}`, { method: 'PUT', headers: { Cookie: cookie } })).status, 404);
  assert.equal((await fetch(`${savedUrl}/${tour.id}`, { method: 'DELETE', headers: { Cookie: cookie } })).status, 200);
  const emptyFavorites = await (await fetch(savedUrl, { headers: { Cookie: cookie } })).json();
  assert.deepEqual(emptyFavorites.data.tours, []);
  const logout = await fetch(`${baseUrl}/api/v1/users/logout`);
  const logoutCookie = logout.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${baseUrl}/api/v1/users/me`, { headers: { Cookie: logoutCookie } })).status, 401);
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
