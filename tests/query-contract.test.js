const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Features = require('../utils/apiFeatures');
const User = require('../model/userModel');
const Tour = require('../model/tourModel');
const Review = require('../model/reviewModel');
const factory = require('../controllers/handlerFactory');
const tours = require('../controllers/tourController');
const passwordInput = require('../utils/passwordInput');
const app = require('../app');
let server;
let baseUrl;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function queryDouble() {
  return {
    filter: {},
    find(filter) {
      Object.assign(this.filter, filter);
      return this;
    },
    sort() {
      return this;
    },
    select() {
      return this;
    },
    skip() {
      return this;
    },
    limit() {
      return this;
    },
    then(resolve) {
      resolve([]);
    },
  };
}

test('comparison conversion changes operators only, never literal filter values', () => {
  const query = queryDouble();
  new Features(
    query,
    { name: 'gte', price: { gte: '10', lte: '50' } },
    Tour.schema,
  ).filter();
  assert.deepEqual(query.filter, {
    name: 'gte',
    price: { $gte: '10', $lte: '50' },
  });
});

test('query field allowlists reject hidden fields, unknown paths, malformed lists, and operator payloads', () => {
  for (const input of [
    { fields: '+password' },
    { fields: 'passwordResetToken' },
    { sort: 'password' },
    { password: 'secret' },
    { role: { ne: 'admin' } },
    { role: ['admin'] },
    { unknown: 'value' },
    { sort: ['name'] },
    { fields: 'name,-email' },
    { fields: 'name,,email' },
  ]) {
    assert.throws(
      () =>
        new Features(queryDouble(), input, User.schema)
          .filter()
          .sort()
          .limitFields(),
      (error) => error.statusCode === 400,
    );
  }
  assert.doesNotThrow(() =>
    new Features(
      queryDouble(),
      { fields: 'name,email,-_id', sort: '-name' },
      User.schema,
    )
      .filter()
      .sort()
      .limitFields(),
  );
});

test('nested review route scope takes precedence over a conflicting query filter', async () => {
  const query = queryDouble();
  const model = { schema: Review.schema, find: () => query };
  await new Promise((resolve, reject) =>
    factory.getAll(model)(
      { params: { tourId: 'route-tour' }, query: { tour: 'different-tour' } },
      { status: () => ({ json: resolve }) },
      reject,
    ),
  );
  assert.equal(query.filter.tour, 'route-tour');
});

test('public tour statistics exclude secret tours; monthly plans include all of December 31', async (context) => {
  const pipelines = [];
  context.mock.method(Tour, 'aggregate', async (pipeline) => {
    pipelines.push(pipeline);
    return [];
  });
  const invoke = (handler, params = {}) =>
    new Promise((resolve, reject) =>
      handler({ params }, { status: () => ({ json: resolve }) }, reject),
    );
  await invoke(tours.getTourStats);
  assert.deepEqual(pipelines[0][0].$match.secretTour, { $ne: true });
  await invoke(tours.monthlyPlan, { year: '2030' });
  assert.equal(
    pipelines[1][1].$match.startDates.$lt.toISOString(),
    '2031-01-01T00:00:00.000Z',
  );
  await assert.rejects(
    invoke(tours.monthlyPlan, { year: 'invalid' }),
    (error) => error.statusCode === 400,
  );
  assert.equal(pipelines.length, 2);
});

test('nested detail reads include the URL tour in the database predicate', async () => {
  let predicate;
  const model = {
    findOne(filter) {
      predicate = filter;
      return Promise.resolve(null);
    },
  };
  const error = await new Promise((resolve) =>
    factory.getOne(model)(
      { params: { id: 'review-id', tourId: 'route-tour' } },
      {},
      resolve,
    ),
  );
  assert.equal(error.statusCode, 404);
  assert.deepEqual(predicate, { _id: 'review-id', tour: 'route-tour' });
});

test('new-password policy rejects bcrypt-truncated Unicode and accepts the exact byte boundary', () => {
  for (const password of ['a'.repeat(73), '😀'.repeat(19), 'short']) {
    assert.throws(
      () => passwordInput({ password, confirmPassword: password }),
      (error) => error.statusCode === 400,
    );
  }
  const password = '😀'.repeat(18);
  assert.equal(Buffer.byteLength(password, 'utf8'), 72);
  assert.doesNotThrow(() =>
    passwordInput({ password, confirmPassword: password }),
  );
});

test('invalid account and list inputs return 400 before database access', async () => {
  for (const query of [
    'sort[name]=1',
    'fields=%2Bpassword',
    'price[ne]=1',
    'unknown=1',
  ]) {
    const response = await fetch(`${baseUrl}/api/v1/tours?${query}`);
    assert.equal(response.status, 400);
    await response.text();
  }
  for (const [route, body] of [
    ['login', { email: { ne: 'x' }, password: 'test-password' }],
    ['login', { email: 'test@example.com', password: {} }],
    [
      'signup',
      {
        name: {},
        email: 'test@example.com',
        password: 'test-password',
        confirmPassword: 'test-password',
      },
    ],
    [
      'signup',
      {
        name: 'Test',
        email: 'test@example.com',
        password: 'a'.repeat(73),
        confirmPassword: 'a'.repeat(73),
      },
    ],
  ]) {
    const response = await fetch(`${baseUrl}/api/v1/users/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    await response.text();
  }
});
