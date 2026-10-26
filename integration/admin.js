const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../model/userModel');
const Tour = require('../model/tourModel');
const Booking = require('../model/bookingModel');
const Departure = require('../model/departureModel');
const app = require('../app');
let server;
let baseUrl;
const users = [];
const tours = [];
let adminToken;
let customerToken;
let hiddenTour;
const fixture = () => ({
  name: `Admin Tour ${randomUUID().slice(0, 8)}`,
  summary: 'Disposable administration fixture',
  imageCover: 'demo-placeholder.svg',
  price: 40,
  duration: 1,
  MaxGroupSize: 12,
  difficulty: 'easy',
});
const tomorrow = () =>
  new Date(Date.now() + 86400000).toISOString().slice(0, 10);
async function request(path, token, method = 'GET', body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
}
before(async () => {
  process.env.JWT_SECRET = randomUUID() + randomUUID();
  await mongoose.connect(
    'mongodb://127.0.0.1:27018/planit_test?replicaSet=planit-rs',
    { serverSelectionTimeoutMS: 5000 },
  );
  await Promise.all([
    User.init(),
    Tour.init(),
    Booking.init(),
    Departure.init(),
  ]);
  for (const role of ['admin', 'user']) {
    const user = await User.create({
      name: 'Admin Integration',
      email: `${role}-${randomUUID()}@example.com`,
      password: 'Fixture-password-123',
      confirmPassword: 'Fixture-password-123',
      role,
    });
    users.push(user.id);
    const token = jwt.sign(
      { id: user.id, passwordVersion: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );
    if (role === 'admin') adminToken = token;
    else customerToken = token;
  }
  hiddenTour = await Tour.create({ ...fixture(), secretTour: true });
  tours.push(hiddenTour.id);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  try {
    await Booking.deleteMany({ user: { $in: users } });
    await Departure.deleteMany({ tour: { $in: tours } });
    await Tour.deleteMany({ _id: { $in: tours } });
    await User.deleteMany({ _id: { $in: users } });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
});

test('admin catalog requires a server-verified admin role and validates pagination', async () => {
  assert.equal((await request('/api/v1/admin/tours')).status, 401);
  assert.equal(
    (await request('/api/v1/admin/tours', customerToken)).status,
    403,
  );
  for (const query of ['page=0', 'page[x]=1', 'fields=password'])
    assert.equal(
      (await request(`/api/v1/admin/tours?${query}`, adminToken)).status,
      400,
    );
  const response = await request('/api/v1/admin/tours', adminToken);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.ok(
    body.data.tours.some(
      (tour) => tour._id === hiddenTour.id && tour.secretTour,
    ),
  );
  assert.ok(body.data.tours.length <= 25);
  assert.equal(body.data.tours[0].user, undefined);
});

test('admins can create/edit tour metadata and configure safe departure capacity', async () => {
  const denied = await request(
    '/api/v1/tours',
    customerToken,
    'POST',
    fixture(),
  );
  assert.equal(denied.status, 403);
  const created = await request('/api/v1/tours', adminToken, 'POST', {
    ...fixture(),
    secretTour: true,
  });
  assert.equal(created.status, 201);
  const tour = (await created.json()).data.data;
  tours.push(tour._id);
  assert.equal(
    (
      await request(`/api/v1/tours/${tour._id}`, adminToken, 'PATCH', {
        price: -1,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/api/v1/tours/${tour._id}`, adminToken, 'PATCH', {
        duration: 1.5,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/api/v1/tours/${tour._id}`, adminToken, 'PATCH', {
        secretTour: false,
        price: 45,
      })
    ).status,
    200,
  );
  const payload = {
    tourId: tour._id,
    date: tomorrow(),
    capacity: 12,
    closed: false,
  };
  assert.equal(
    (await request('/api/v1/departures', customerToken, 'PUT', payload)).status,
    403,
  );
  assert.equal(
    (await request('/api/v1/departures', adminToken, 'PUT', payload)).status,
    200,
  );
  const departure = await Departure.findOne({ tour: tour._id });
  assert.equal(departure.capacity, 12);
  assert.equal(departure.reservedSeats, 0);
});

test('booking ledger is private and cannot bypass payment or inventory guards', async () => {
  const tour = await Tour.create(fixture());
  tours.push(tour.id);
  const created = await request('/api/v1/bookings', customerToken, 'POST', {
    tourId: tour.id,
    departureDate: tomorrow(),
    guests: 1,
    requestId: randomUUID(),
  });
  assert.equal(created.status, 201);
  const booking = (await created.json()).data.booking;
  assert.equal((await request('/api/v1/bookings', customerToken)).status, 403);
  const ledger = await request(`/api/v1/bookings?user=${users[1]}`, adminToken);
  assert.equal(ledger.status, 200);
  assert.equal(ledger.headers.get('cache-control'), 'no-store');
  assert.ok(
    (await ledger.json()).data.data.some(
      (record) => record._id === booking._id,
    ),
  );
  assert.equal(
    (
      await request(`/api/v1/bookings/${booking._id}`, adminToken, 'PATCH', {
        paid: true,
      })
    ).status,
    409,
  );
  assert.equal(
    (await request(`/api/v1/bookings/${booking._id}`, adminToken, 'DELETE'))
      .status,
    409,
  );
  assert.equal((await Booking.findById(booking._id)).paid, false);
});
