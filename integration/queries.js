const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../model/userModel');
const Tour = require('../model/tourModel');
const app = require('../app');
let server;
let baseUrl;
const identifiers = [];
let publicTour;
let secretTour;
let user;
let token;
before(async () => {
  await mongoose.connect(
    'mongodb://127.0.0.1:27018/planit_test?replicaSet=planit-rs',
    { serverSelectionTimeoutMS: 5000 },
  );
  await Tour.init();
  process.env.JWT_SECRET = randomUUID() + randomUUID();
  const suffix = randomUUID().slice(0, 8);
  for (const secret of [false, true]) {
    const tour = await Tour.create({
      ...require('../data/demo').tours[0],
      name: `Query ${secret ? 'Secret' : 'Public'} ${suffix}`,
      price: secret ? 999 : 40,
      secretTour: secret,
    });
    identifiers.push(tour.id);
    if (secret) secretTour = tour;
    else publicTour = tour;
  }
  user = await User.create({
    name: 'Query Fixture',
    email: `queries-${suffix}@example.com`,
    password: 'Query-fixture-password-123',
    confirmPassword: 'Query-fixture-password-123',
    savedTours: identifiers,
  });
  token = jwt.sign(
    { id: user.id, passwordVersion: 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  try {
    if (user) await User.deleteOne({ _id: user.id });
    if (identifiers.length)
      await Tour.deleteMany({ _id: { $in: identifiers } });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
});
test('public list, direct reads, and crafted filters cannot expose secret tours', async () => {
  for (const suffix of [
    `?name=${encodeURIComponent(secretTour.name)}`,
    `?secretTour=true&name=${encodeURIComponent(secretTour.name)}`,
  ]) {
    const response = await fetch(`${baseUrl}/api/v1/tours${suffix}`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.data, []);
  }
  const hidden = await fetch(`${baseUrl}/api/v1/tours/${secretTour.id}`);
  assert.equal(hidden.status, 404);
  await hidden.text();
  const visible = await fetch(`${baseUrl}/api/v1/tours/${publicTour.id}`);
  assert.equal(visible.status, 200);
  assert.equal((await visible.json()).data.data._id, publicTour.id);
});

test('secret tours cannot be added to favorites or exposed by existing saved references', async () => {
  const headers = { Authorization: `Bearer ${token}` };
  const rejected = await fetch(
    `${baseUrl}/api/v1/users/saved-tours/${secretTour.id}`,
    { method: 'PUT', headers },
  );
  assert.equal(rejected.status, 404);
  await rejected.text();
  const response = await fetch(`${baseUrl}/api/v1/users/saved-tours`, {
    headers,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(
    (await response.json()).data.tours.map((tour) => tour._id),
    [publicTour.id],
  );
});
test('valid numeric comparison, projection, sorting, and pagination still work against MongoDB', async () => {
  const parameters = new URLSearchParams({
    name: publicTour.name,
    'price[gte]': '10',
    'price[lte]': '50',
    sort: '-price',
    fields: 'name,price,-_id',
    page: '1',
    limit: '12',
  });
  const response = await fetch(`${baseUrl}/api/v1/tours?${parameters}`);
  assert.equal(response.status, 200);
  const records = (await response.json()).data.data;
  assert.equal(records.length, 1);
  assert.equal(records[0].name, publicTour.name);
  assert.equal(records[0].price, 40);
  assert.equal(records[0]._id, undefined);
});
