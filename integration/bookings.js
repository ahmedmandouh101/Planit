const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../model/userModel');
const Tour = require('../model/tourModel');
const Booking = require('../model/bookingModel');
const app = require('../app');

let server;
let baseUrl;
let owner;
let other;
let tour;
const users = [];
const tours = [];
const futureDate = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const cookie = (user) => `jwt=${jwt.sign({ id: user.id, passwordVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;

before(async () => {
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  await mongoose.connect('mongodb://127.0.0.1:27017/planit_test', { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Tour.init(), Booking.init()]);
  for (const name of ['Booking Owner', 'Other Owner']) {
    const user = await User.create({ name, email: `${crypto.randomUUID()}@example.com`, password: 'Booking-test-123', confirmPassword: 'Booking-test-123' });
    users.push(user);
  }
  [owner, other] = users;
  tour = await Tour.create({ ...require('../data/demo').tours[0], name: `Booking ${crypto.randomUUID().slice(0, 20)}`, price: 19.95, MaxGroupSize: 4 });
  tours.push(tour.id);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/bookings`;
});

after(async () => {
  try {
    await Booking.deleteMany({ user: { $in: users.map((user) => user.id) } });
    await Tour.deleteMany({ _id: { $in: tours } });
    await User.deleteMany({ _id: { $in: users.map((user) => user.id) } });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
});

function request(path = '', method = 'GET', body, user = owner) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(user ? { Cookie: cookie(user) } : {}), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
}
const payload = (extra = {}) => ({ tourId: tour.id, departureDate: futureDate(10), guests: 3, requestId: crypto.randomUUID(), ...extra });

test('anonymous users cannot create, list, or cancel bookings', async () => {
  for (const [path, method, body] of [['', 'POST', payload()], ['/mine', 'GET'], [`/${new mongoose.Types.ObjectId()}/cancel`, 'PATCH']]) {
    assert.equal((await request(path, method, body, null)).status, 401);
  }
});

test('the server owns price, identity, status, and duplicate submission handling', async () => {
  const body = payload({ user: other.id, price: 0.01, unitPrice: 0.01, paid: true, status: 'cancelled' });
  const responses = await Promise.all([request('', 'POST', body), request('', 'POST', body)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
  const results = await Promise.all(responses.map((response) => response.json()));
  const booking = results[0].data.booking;
  assert.equal(results[1].data.booking._id, booking._id);
  assert.equal(booking.price, 59.85);
  assert.equal(booking.unitPrice, 19.95);
  assert.equal(booking.paid, false);
  assert.equal(booking.status, 'pending');
  assert.equal(booking.currency, 'USD');
  assert.equal(booking.user, undefined);
  assert.equal(await Booking.countDocuments({ user: owner.id, requestId: body.requestId }), 1);
  assert.equal((await request('', 'POST', { ...body, guests: 2 })).status, 409);
  assert.equal((await request('', 'POST', payload())).status, 409);
  const mine = await (await request('/mine?user=' + other.id)).json();
  assert.ok(mine.data.bookings.some((record) => record._id === booking._id));
  assert.deepEqual((await (await request('/mine', 'GET', undefined, other)).json()).data.bookings, []);
  assert.equal((await request(`/${booking._id}/cancel`, 'PATCH', undefined, other)).status, 404);
  assert.equal((await request(`/${booking._id}`, 'PATCH', { paid: true })).status, 403);
  assert.equal((await request(`/${booking._id}`, 'DELETE')).status, 403);
  const cancelled = await request(`/${booking._id}/cancel`, 'PATCH');
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).data.booking.status, 'cancelled');
  assert.equal((await request(`/${booking._id}/cancel`, 'PATCH')).status, 200);
  assert.equal((await (await request('', 'POST', body)).json()).data.booking.status, 'cancelled');
});

test('invalid dates, IDs, guest counts, and unoffered departures are rejected', async () => {
  const invalid = [
    { tourId: 'invalid' }, { requestId: 'invalid' }, { guests: 0 }, { guests: -1 },
    { guests: 1.5 }, { guests: '2' }, { guests: 5 }, { departureDate: futureDate(-1) },
    { departureDate: futureDate(0) }, { departureDate: '2030-02-30' }, { departureDate: 'tomorrow' },
  ];
  for (const extra of invalid) assert.equal((await request('', 'POST', payload(extra))).status, 400, JSON.stringify(extra));
  assert.equal((await request('', 'POST', payload({ tourId: new mongoose.Types.ObjectId().toString() }))).status, 404);
  assert.equal((await request('/mine?page=-1')).status, 400);
  assert.equal((await request('/invalid/cancel', 'PATCH')).status, 400);
  assert.equal((await request(`/${new mongoose.Types.ObjectId()}/cancel`, 'PATCH')).status, 404);
  await Tour.findByIdAndUpdate(tour.id, { startDates: [futureDate(20)] });
  assert.equal((await request('', 'POST', payload({ departureDate: futureDate(21) }))).status, 400);
  assert.equal((await request('', 'POST', payload({ departureDate: futureDate(20) }))).status, 201);
  await Tour.findByIdAndUpdate(tour.id, { secretTour: true });
  assert.equal((await request('', 'POST', payload({ departureDate: futureDate(20) }))).status, 404);
  await Tour.findByIdAndUpdate(tour.id, { secretTour: false, startDates: [] });
});

test('paid or departed requests cannot be cancelled and listing is paginated', async () => {
  const created = await (await request('', 'POST', payload({ departureDate: futureDate(25) }))).json();
  const identifier = created.data.booking._id;
  await Booking.findByIdAndUpdate(identifier, { paid: true });
  assert.equal((await request(`/${identifier}/cancel`, 'PATCH')).status, 409);
  await Booking.findByIdAndUpdate(identifier, { paid: false, departureDate: futureDate(-1) });
  assert.equal((await request(`/${identifier}/cancel`, 'PATCH')).status, 409);
  const records = Array.from({ length: 13 }, (_, index) => ({ tour: tour.id, tourName: tour.name, user: other.id, price: 19.95, unitPrice: 19.95, guests: 1, departureDate: futureDate(index + 30), requestId: crypto.randomUUID() }));
  await Booking.insertMany(records);
  const first = await (await request('/mine', 'GET', undefined, other)).json();
  const second = await (await request('/mine?page=2', 'GET', undefined, other)).json();
  assert.equal(first.data.bookings.length, 12);
  assert.equal(first.hasMore, true);
  assert.equal(second.data.bookings.length, 1);
  assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.data.bookings, ...second.data.bookings].map((booking) => booking._id)).size, 13);
});
