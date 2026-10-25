const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../model/userModel');
const Tour = require('../model/tourModel');
const Booking = require('../model/bookingModel');
const Departure = require('../model/departureModel');
const inventory = require('../utils/seatInventory');
const app = require('../app');

let server;
let baseUrl;
let tour;
let owner;
let other;
let admin;
const users = [];
let dateOffset = 10;
const nextDate = () =>
  new Date(Date.now() + ++dateOffset * 86400000).toISOString().slice(0, 10);
const cookie = (user) =>
  `jwt=${jwt.sign({ id: user.id, passwordVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;

before(async () => {
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
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
  for (const role of ['user', 'user', 'admin'])
    users.push(
      await User.create({
        name: 'Inventory Tester',
        email: `${crypto.randomUUID()}@example.com`,
        password: 'Inventory-test-123',
        confirmPassword: 'Inventory-test-123',
        role,
      }),
    );
  [owner, other, admin] = users;
  tour = await Tour.create({
    ...require('../data/demo').tours[0],
    name: `Inventory ${crypto.randomUUID().slice(0, 20)}`,
    price: 10,
    MaxGroupSize: 4,
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  try {
    await Booking.deleteMany({ user: { $in: users.map((user) => user.id) } });
    if (tour) {
      await Departure.deleteMany({ tour: tour.id });
      await Tour.deleteOne({ _id: tour.id });
    }
    await User.deleteMany({ _id: { $in: users.map((user) => user.id) } });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
});

function request(path, method = 'GET', body, user = owner) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { Cookie: cookie(user) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
}
async function configure(date, capacity = 4, closed = false) {
  const response = await request(
    '/departures',
    'PUT',
    { tourId: tour.id, date, capacity, closed },
    admin,
  );
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()).data.departure;
}
async function booking(date, user = owner) {
  const response = await request(
    '/bookings',
    'POST',
    {
      tourId: tour.id,
      departureDate: date,
      guests: 3,
      requestId: crypto.randomUUID(),
      holdStatus: 'held',
      holdExpiresAt: '2099-01-01',
    },
    user,
  );
  assert.equal(response.status, 201, await response.clone().text());
  const result = (await response.json()).data.booking;
  assert.equal(result.holdStatus, 'none');
  return result;
}
const hold = (record, user = owner) =>
  request(
    `/bookings/${record._id}/hold`,
    'POST',
    { guests: 999, holdExpiresAt: '2099-01-01' },
    user,
  );

test('only admins configure validated departures; public availability exposes no customer data', async () => {
  const date = nextDate();
  assert.equal(
    (
      await request('/departures', 'PUT', {
        tourId: tour.id,
        date,
        capacity: 4,
      })
    ).status,
    403,
  );
  assert.equal((await request('/departures', 'PUT', {}, null)).status, 401);
  for (const capacity of [0, 1001, 1.5, '4'])
    assert.equal(
      (
        await request(
          '/departures',
          'PUT',
          { tourId: tour.id, date, capacity },
          admin,
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await request(
        '/departures',
        'PUT',
        { tourId: tour.id, date: '2030-02-30', capacity: 4 },
        admin,
      )
    ).status,
    400,
  );
  const configured = await configure(date);
  const response = await request(
    `/departures?tourId=${tour.id}`,
    'GET',
    undefined,
    null,
  );
  assert.equal(response.status, 200);
  const published = (await response.json()).data.departures.find(
    (departure) => departure._id === configured._id,
  );
  assert.equal(published.availableSeats, 4);
  assert.deepEqual(Object.keys(published).sort(), [
    '_id',
    'availableSeats',
    'capacity',
    'closed',
    'date',
  ]);
});

test('concurrent customers cannot overbook, and retrying a hold never extends it', async () => {
  const date = nextDate();
  const departure = await configure(date);
  const first = await booking(date);
  const second = await booking(date, other);
  const responses = await Promise.all([hold(first), hold(second, other)]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  assert.equal((await Departure.findById(departure._id)).reservedSeats, 3);
  const winner = responses[0].status === 200 ? first : second;
  const user = winner._id === first._id ? owner : other;
  const stored = await Booking.findById(winner._id);
  const retried = await (await hold(winner, user)).json();
  assert.equal(
    retried.data.booking.holdExpiresAt,
    stored.holdExpiresAt.toISOString(),
  );
  assert.ok(stored.holdExpiresAt.getTime() - Date.now() <= 15 * 60 * 1000);
  assert.ok(stored.holdExpiresAt > new Date());
  assert.equal((await Departure.findById(departure._id)).reservedSeats, 3);
});

test('release is idempotent and cancellation racing acquisition cannot leak seats', async () => {
  const date = nextDate();
  const departure = await configure(date);
  const record = await booking(date);
  assert.equal((await hold(record)).status, 200);
  for (let attempt = 0; attempt < 2; attempt += 1)
    assert.equal(
      (await request(`/bookings/${record._id}/hold`, 'DELETE')).status,
      200,
    );
  assert.equal((await Departure.findById(departure._id)).reservedSeats, 0);
  const results = await Promise.all([
    request(`/bookings/${record._id}/cancel`, 'PATCH'),
    hold(record),
  ]);
  assert.equal(results[0].status, 200);
  assert.ok([200, 409].includes(results[1].status));
  assert.equal((await Booking.findById(record._id)).status, 'cancelled');
  assert.equal((await Departure.findById(departure._id)).reservedSeats, 0);
  assert.equal((await hold(record)).status, 409);
});

test('expiry releases seats during acquisition and through restart-safe cleanup', async () => {
  const date = nextDate();
  const departure = await configure(date);
  const first = await booking(date);
  const second = await booking(date, other);
  assert.equal((await hold(first)).status, 200);
  await Booking.findByIdAndUpdate(first._id, {
    holdExpiresAt: new Date(Date.now() - 1000),
  });
  assert.equal((await hold(second, other)).status, 200);
  assert.equal((await Booking.findById(first._id)).holdStatus, 'expired');
  assert.equal((await Departure.findById(departure._id)).reservedSeats, 3);
  await Booking.findByIdAndUpdate(second._id, {
    holdExpiresAt: new Date(Date.now() - 1000),
  });
  const publicAvailability = await (
    await request(`/departures?tourId=${tour.id}`, 'GET', undefined, null)
  ).json();
  assert.equal(
    publicAvailability.data.departures.find(
      (record) => record._id === departure._id,
    ).availableSeats,
    4,
  );
  assert.equal((await hold(first)).status, 200);
  await Booking.findByIdAndUpdate(first._id, {
    holdExpiresAt: new Date(Date.now() - 1000),
  });
  await inventory.expireAllHolds();
  await inventory.expireAllHolds();
  assert.equal((await Departure.findById(departure._id)).reservedSeats, 0);
  assert.equal((await Booking.findById(second._id)).holdStatus, 'expired');
  assert.equal(await Booking.countDocuments({ _id: second._id }), 1);
});

test('capacity cannot shrink below holds; closed departures reject new holds', async () => {
  const date = nextDate();
  const departure = await configure(date);
  const first = await booking(date);
  const second = await booking(date, other);
  assert.equal((await hold(first)).status, 200);
  assert.equal(
    (
      await request(
        '/departures',
        'PUT',
        { tourId: tour.id, date, capacity: 2 },
        admin,
      )
    ).status,
    409,
  );
  assert.equal((await Departure.findById(departure._id)).capacity, 4);
  await configure(date, 6, true);
  assert.equal((await hold(second, other)).status, 409);
  assert.equal((await hold(first)).status, 200);
  await configure(date, 6, false);
  assert.equal((await hold(second, other)).status, 200);
  assert.equal((await Departure.findById(departure._id)).reservedSeats, 6);
});

test('ownership and generic admin write guards protect the inventory ledger', async () => {
  const date = nextDate();
  const departure = await configure(date);
  const record = await booking(date);
  assert.equal((await hold(record, null)).status, 401);
  assert.equal((await hold(record, other)).status, 404);
  assert.equal(
    (await request(`/bookings/${record._id}/hold`, 'DELETE', undefined, other))
      .status,
    404,
  );
  assert.equal((await hold(record)).status, 200);
  assert.equal(
    (
      await request(
        `/bookings/${record._id}`,
        'PATCH',
        { paid: true, guests: 1 },
        admin,
      )
    ).status,
    409,
  );
  assert.equal(
    (await request(`/bookings/${record._id}`, 'DELETE', undefined, admin))
      .status,
    409,
  );
  assert.equal((await Departure.findById(departure._id)).reservedSeats, 3);
});

test('an error after reserving seats rolls back both counter and booking metadata', async (context) => {
  const date = nextDate();
  const departure = await configure(date);
  const record = await booking(date);
  context.mock.method(Booking, 'findOneAndUpdate', () => {
    throw new Error('Injected booking write failure');
  });
  await assert.rejects(
    inventory.holdBooking(record._id, owner.id),
    /Injected booking write failure/,
  );
  assert.equal((await Departure.findById(departure._id)).reservedSeats, 0);
  assert.equal((await Booking.findById(record._id)).holdStatus, 'none');
});
