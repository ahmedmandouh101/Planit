const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');
const User = require('../model/userModel');
const Review = require('../model/reviewModel');
const Email = require('../utils/email');
const Place = require('../model/placeModel');
const userController = require('../controllers/userController');
const reviewController = require('../controllers/reviewController');

let server;
let baseUrl;

before(async () => {
  process.env.JWT_SECRET = 'test-secret-for-local-regression-tests-only';
  process.env.JWT_SECRET_EXPIRES_IN = '1h';
  process.env.JWT_COOKIE_EXPIRES_IN = '1';
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('signup cannot choose an administrator role', async (context) => {
  context.mock.method(User, 'create', async (input) => {
    assert.equal(input.role, undefined);
    return { ...input, _id: '507f1f77bcf86cd799439011', role: 'user' };
  });
  context.mock.method(Email.prototype, 'sendWelcome', async () => {});
  const response = await fetch(`${baseUrl}/api/v1/users/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test User', email: 'test@example.com', password: 'password123', confirmPassword: 'password123', role: 'admin' }),
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.user.role, 'user');
});

test('anonymous users cannot create or delete drivers', async () => {
  for (const [method, route] of [['POST', '/'], ['DELETE', '/507f1f77bcf86cd799439011']]) {
    const response = await fetch(`${baseUrl}/api/v1/drivers${route}`, { method });
    assert.equal(response.status, 401);
  }
});

test('unknown routes return an operational 404 without a configured NODE_ENV', async () => {
  const response = await fetch(`${baseUrl}/missing`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).status, 'fail');
});

test('frontend and API metadata are served separately with security headers', async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /id="tour-grid"/);
  assert.ok(response.headers.get('content-security-policy'));
  const metadata = await fetch(`${baseUrl}/api/v1`);
  assert.equal((await metadata.json()).message, 'Planit API');
});

test('health endpoints distinguish a live app from database readiness', async () => {
  assert.equal((await fetch(`${baseUrl}/health/live`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/health/ready`)).status, 503);
});

test('search rejects missing and oversized queries', async () => {
  for (const suffix of ['', `?q=${'a'.repeat(101)}`]) {
    const response = await fetch(`${baseUrl}/api/v1/search${suffix}`);
    assert.equal(response.status, 400);
  }
});

test('search treats regex characters as literal text and searches the address', async (context) => {
  context.mock.method(Place, 'find', (filter) => {
    assert.equal(filter.$or[0].name.$regex.source, '\\[');
    assert.ok(filter.$or.some((entry) => entry['location.address']));
    return { sort: () => ({ limit: async (limit) => {
      assert.equal(limit, 100);
      return [];
    } }) };
  });
  const response = await fetch(`${baseUrl}/api/v1/search?q=%5B`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.results, []);
});

test('administrator profile updates cannot bypass password hashing hooks', async (context) => {
  context.mock.method(User, 'findByIdAndUpdate', async (identifier, body) => {
    assert.deepEqual(body, { name: 'Updated', role: 'guide' });
    return { _id: identifier, ...body };
  });
  const request = { params: { id: 'user' }, body: {
    name: 'Updated', role: 'guide', password: 'plaintext', passwordChangedAt: null,
  } };
  await new Promise((resolve, reject) => {
    userController.updateUser(request, { status: () => ({ json: resolve }) }, reject);
  });
});

test('review creation always uses the authenticated user and nested tour', () => {
  const request = { body: { user: 'victim', tour: 'other' }, params: { tourId: 'tour' }, user: { id: 'owner' } };
  reviewController.setTourUserIds(request, {}, () => {});
  assert.equal(request.body.user, 'owner');
  assert.equal(request.body.tour, 'tour');
});

test('review mutations enforce ownership and preserve resource identity', async (context) => {
  context.mock.method(Review, 'findById', async () => ({ user: { _id: 'owner' }, tour: 'tour' }));
  const invoke = (request) => new Promise((resolve) => reviewController.authorizeReviewMutation(request, {}, resolve));
  const request = { params: { id: 'review' }, user: { id: 'other', role: 'user' }, body: {} };
  assert.equal((await invoke(request)).statusCode, 403);
  request.user.id = 'owner';
  request.body = { rating: 4, review: 'Updated', user: 'victim', tour: 'other' };
  assert.equal(await invoke(request), undefined);
  assert.deepEqual(request.body, { rating: 4, review: 'Updated' });
  request.params.tourId = 'wrong-tour';
  assert.equal((await invoke(request)).statusCode, 404);
  request.params.tourId = 'tour';
  request.user = { id: 'admin', role: 'admin' };
  assert.equal(await invoke(request), undefined);
});
