const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Stripe = require('stripe');
const User = require('../model/userModel');
const Tour = require('../model/tourModel');
const Booking = require('../model/bookingModel');
const Departure = require('../model/departureModel');
const Attempt = require('../model/paymentAttemptModel');
const stripeClient = require('../utils/stripeClient');
const payments = require('../utils/payments');
const inventory = require('../utils/seatInventory');
const app = require('../app');

let server;
let baseUrl;
let owner;
let other;
let tour;
const users = [];
const sessionRecords = new Map();
const sessionKeys = new Map();
const sessionParameters = new Map();
const refunds = new Map();
let unknownCreateOutcome = false;
let payDuringExpiry = false;
let refundDown = false;
let providerDown = false;
let pendingRefund = false;
let offset = 10;
const originalGetClient = stripeClient.getClient;
const sdk = new Stripe('sk_test_no_network_calls');
const clone = (value) => structuredClone(value);
const token = (user) =>
  jwt.sign({ id: user.id, passwordVersion: 0 }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

sdk.checkout.sessions.create = async (parameters, options) => {
  if (providerDown) throw new Error('Provider offline');
  const existingId = sessionKeys.get(options.idempotencyKey);
  if (existingId) return clone(sessionRecords.get(existingId));
  const id = `cs_test_${crypto.randomUUID()}`;
  const checkout = {
    id,
    livemode: false,
    mode: 'payment',
    metadata: parameters.metadata,
    client_reference_id: parameters.client_reference_id,
    amount_total: parameters.line_items[0].price_data.unit_amount,
    currency: parameters.line_items[0].price_data.currency,
    status: 'open',
    payment_status: 'unpaid',
    expires_at: parameters.expires_at,
    url: `https://checkout.stripe.com/c/pay/${id}`,
    payment_intent: `pi_${crypto.randomUUID()}`,
  };
  sessionRecords.set(id, checkout);
  sessionKeys.set(options.idempotencyKey, id);
  sessionParameters.set(id, clone(parameters));
  if (unknownCreateOutcome) {
    unknownCreateOutcome = false;
    throw new Error('Response lost after provider creation');
  }
  return clone(checkout);
};
sdk.checkout.sessions.retrieve = async (id) => {
  if (providerDown) throw new Error('Provider offline');
  if (!sessionRecords.has(id)) throw new Error('Unknown session');
  return clone(sessionRecords.get(id));
};
sdk.checkout.sessions.expire = async (id) => {
  if (providerDown) throw new Error('Provider offline');
  const checkout = sessionRecords.get(id);
  if (payDuringExpiry) {
    payDuringExpiry = false;
    checkout.status = 'complete';
    checkout.payment_status = 'paid';
    throw new Error('Already complete');
  }
  if (checkout.status !== 'open') throw new Error('Not open');
  checkout.status = 'expired';
  return clone(checkout);
};
sdk.refunds.create = async (parameters, options) => {
  if (refundDown) throw new Error('Refund provider offline');
  if (!refunds.has(options.idempotencyKey))
    refunds.set(options.idempotencyKey, {
      id: `re_${crypto.randomUUID()}`,
      status: pendingRefund ? 'pending' : 'succeeded',
      payment_intent: parameters.payment_intent,
    });
  return clone(refunds.get(options.idempotencyKey));
};
sdk.refunds.retrieve = async (id) =>
  clone([...refunds.values()].find((refund) => refund.id === id));

before(async () => {
  Object.assign(process.env, {
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    STRIPE_SECRET_KEY: 'sk_test_local_fixture',
    STRIPE_WEBHOOK_SECRET: 'whsec_local_fixture_only',
    PUBLIC_APP_URL: 'https://planit.example.test',
  });
  stripeClient.getClient = () => sdk;
  await mongoose.connect(
    'mongodb://127.0.0.1:27018/planit_test?replicaSet=planit-rs',
    { serverSelectionTimeoutMS: 5000 },
  );
  await Promise.all([
    User.init(),
    Tour.init(),
    Booking.init(),
    Departure.init(),
    Attempt.init(),
  ]);
  for (const name of ['Payment Owner', 'Other Owner'])
    users.push(
      await User.create({
        name,
        email: `${crypto.randomUUID()}@example.com`,
        password: 'Payment-test-123',
        confirmPassword: 'Payment-test-123',
      }),
    );
  [owner, other] = users;
  tour = await Tour.create({
    ...require('../data/demo').tours[0],
    name: `Payment ${crypto.randomUUID().slice(0, 20)}`,
    price: 10,
    MaxGroupSize: 4,
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  stripeClient.getClient = originalGetClient;
  try {
    await Attempt.deleteMany({ user: { $in: users.map((user) => user.id) } });
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
  return fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { Cookie: `jwt=${token(user)}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
}
async function fixture() {
  const date = new Date(Date.now() + ++offset * 86400000);
  const day = date.toISOString().slice(0, 10);
  const departure = await Departure.create({
    tour: tour.id,
    date: new Date(day),
    capacity: 4,
  });
  const booking = await Booking.create({
    tour: tour.id,
    tourName: tour.name,
    user: owner.id,
    departureDate: day,
    guests: 2,
    unitPrice: 10,
    price: 20,
    requestId: crypto.randomUUID(),
  });
  await inventory.holdBooking(booking.id, owner.id);
  return { booking, departure };
}
async function start(booking) {
  const response = await request(`/bookings/${booking.id}/checkout`, 'POST', {
    amount: 1,
    paid: true,
    currency: 'eur',
  });
  assert.equal(response.status, 200, await response.clone().text());
  return Attempt.findOne({ booking: booking.id, active: true });
}
function webhook(checkout, type = 'checkout.session.completed', changes = {}) {
  const payload = JSON.stringify(
    {
      id: `evt_${crypto.randomUUID()}`,
      livemode: false,
      type,
      data: { object: checkout },
      ...changes,
    },
    null,
    2,
  );
  const signature = sdk.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  return fetch(`${baseUrl}/api/v1/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': signature,
    },
    body: payload,
    signal: AbortSignal.timeout(15000),
  });
}

test('unconfigured or live keys cannot enable checkout; signatures and ownership are enforced', async () => {
  const { booking } = await fixture();
  const key = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_live_forbidden';
  assert.equal(
    (await request(`/bookings/${booking.id}/checkout`, 'POST')).status,
    503,
  );
  assert.equal(
    (await (await request('/payments/status')).json()).data.enabled,
    false,
  );
  process.env.STRIPE_SECRET_KEY = key;
  assert.equal(
    (await request(`/bookings/${booking.id}/checkout`, 'POST', {}, null))
      .status,
    401,
  );
  assert.equal(
    (await request(`/bookings/${booking.id}/checkout`, 'POST', {}, other))
      .status,
    404,
  );
  assert.equal(
    (
      await request(
        `/bookings/${booking.id}/checkout/cancel`,
        'POST',
        {},
        other,
      )
    ).status,
    404,
  );
  const bad = await fetch(`${baseUrl}/api/v1/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': 'invalid',
    },
    body: '{}',
  });
  assert.equal(bad.status, 400);
  assert.equal((await Booking.findById(booking.id)).paid, false);
});

test('concurrent checkout uses one attempt and server prices; browser return cannot confirm payment', async () => {
  const { booking, departure } = await fixture();
  const beforeCount = sessionRecords.size;
  const responses = await Promise.all([
    request(`/bookings/${booking.id}/checkout`, 'POST', { amount: 1 }),
    request(`/bookings/${booking.id}/checkout`, 'POST', { amount: 1 }),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200],
  );
  const attempt = await Attempt.findOne({ booking: booking.id, active: true });
  assert.equal(await Attempt.countDocuments({ booking: booking.id }), 1);
  assert.equal(sessionRecords.size - beforeCount, 1);
  const parameters = sessionParameters.get(attempt.stripeSessionId);
  assert.equal(parameters.line_items[0].price_data.unit_amount, 2000);
  assert.equal(parameters.line_items[0].price_data.currency, 'usd');
  assert.deepEqual(parameters.payment_method_types, ['card']);
  assert.equal(
    parameters.success_url,
    'https://planit.example.test/#checkout=returned',
  );
  assert.ok(parameters.expires_at * 1000 - Date.now() > 30 * 60000);
  await fetch(`${baseUrl}/?paid=true&booking=${booking.id}#checkout=returned`);
  assert.equal((await Booking.findById(booking.id)).paid, false);
  assert.equal(
    (await request(`/bookings/${booking.id}/cancel`, 'PATCH')).status,
    409,
  );
  assert.equal(
    (await request(`/bookings/${booking.id}/hold`, 'DELETE')).status,
    409,
  );
  await Booking.findByIdAndUpdate(booking.id, {
    holdExpiresAt: new Date(Date.now() - 1000),
  });
  await inventory.expireAllHolds();
  assert.equal((await Departure.findById(departure.id)).reservedSeats, 2);
});

test('raw signed paid events confirm once; mismatches, unpaid and live events cannot confirm', async () => {
  const { booking, departure } = await fixture();
  const attempt = await start(booking);
  const checkout = clone(sessionRecords.get(attempt.stripeSessionId));
  assert.equal(
    (
      await webhook({
        ...checkout,
        status: 'complete',
        payment_status: 'unpaid',
      })
    ).status,
    200,
  );
  assert.equal((await Booking.findById(booking.id)).paid, false);
  const paid = { ...checkout, status: 'complete', payment_status: 'paid' };
  assert.equal((await webhook({ ...paid, amount_total: 1 })).status, 400);
  assert.equal(
    (await webhook(paid, 'checkout.session.completed', { livemode: true }))
      .status,
    400,
  );
  const responses = await Promise.all([webhook(paid), webhook(paid)]);
  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200],
  );
  assert.equal(
    (
      await webhook(
        { ...checkout, status: 'expired' },
        'checkout.session.expired',
      )
    ).status,
    200,
  );
  const confirmed = await Booking.findById(booking.id);
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.paid, true);
  assert.equal(confirmed.holdStatus, 'confirmed');
  assert.equal(confirmed.checkoutLocked, false);
  assert.equal((await Departure.findById(departure.id)).reservedSeats, 2);
  assert.equal(
    (await request(`/bookings/${booking.id}/cancel`, 'PATCH')).status,
    409,
  );
});

test('unknown provider creation outcome is durable and retries the same session', async () => {
  const { booking } = await fixture();
  unknownCreateOutcome = true;
  const count = sessionRecords.size;
  assert.equal(
    (await request(`/bookings/${booking.id}/checkout`, 'POST')).status,
    503,
  );
  assert.equal((await Booking.findById(booking.id)).checkoutLocked, true);
  assert.equal(sessionRecords.size - count, 1);
  await start(booking);
  assert.equal(sessionRecords.size - count, 1);
  assert.equal(await Attempt.countDocuments({ booking: booking.id }), 1);
  assert.equal(
    (await request(`/bookings/${booking.id}/checkout/cancel`, 'POST')).status,
    200,
  );
  assert.equal((await Booking.findById(booking.id)).checkoutLocked, false);
});

test('Stripe expiry reconciliation releases seats; late payment refunds once and recovers after failure', async () => {
  const { booking, departure } = await fixture();
  const attempt = await start(booking);
  const checkout = sessionRecords.get(attempt.stripeSessionId);
  checkout.status = 'expired';
  providerDown = true;
  await Booking.findByIdAndUpdate(booking.id, {
    holdExpiresAt: new Date(Date.now() - 1000),
  });
  await inventory.expireAllHolds();
  assert.equal((await Departure.findById(departure.id)).reservedSeats, 2);
  providerDown = false;
  await payments.reconcile();
  assert.equal((await Departure.findById(departure.id)).reservedSeats, 0);
  refundDown = true;
  const paid = {
    ...clone(checkout),
    status: 'complete',
    payment_status: 'paid',
  };
  assert.equal((await webhook(paid)).status, 503);
  assert.equal((await Attempt.findById(attempt.id)).status, 'refund_pending');
  const refundCount = refunds.size;
  refundDown = false;
  await payments.reconcile();
  assert.equal((await Attempt.findById(attempt.id)).status, 'refunded');
  assert.equal((await Booking.findById(booking.id)).paymentStatus, 'refunded');
  assert.equal((await webhook(paid)).status, 200);
  assert.equal(refunds.size - refundCount, 1);
  assert.equal((await Departure.findById(departure.id)).reservedSeats, 0);
  assert.equal((await Booking.findById(booking.id)).paid, false);
});

test('payment winning a cancel-checkout race confirms instead of releasing seats', async () => {
  const { booking, departure } = await fixture();
  await start(booking);
  payDuringExpiry = true;
  assert.equal(
    (await request(`/bookings/${booking.id}/checkout/cancel`, 'POST')).status,
    409,
  );
  assert.equal((await Booking.findById(booking.id)).status, 'confirmed');
  assert.equal((await Departure.findById(departure.id)).reservedSeats, 2);
});

test('a failed confirmation transaction rolls back and signed event retry succeeds', async (context) => {
  const { booking } = await fixture();
  const attempt = await start(booking);
  const paid = {
    ...clone(sessionRecords.get(attempt.stripeSessionId)),
    status: 'complete',
    payment_status: 'paid',
  };
  const original = Attempt.findByIdAndUpdate;
  context.mock.method(Attempt, 'findByIdAndUpdate', () => {
    throw new Error('Injected attempt failure');
  });
  assert.equal((await webhook(paid)).status, 503);
  assert.equal((await Booking.findById(booking.id)).paid, false);
  context.mock.restoreAll();
  assert.equal(Attempt.findByIdAndUpdate, original);
  assert.equal((await webhook(paid)).status, 200);
  assert.equal((await Booking.findById(booking.id)).status, 'confirmed');
});

test('late payment on an older attempt cannot take seats or state from a newer checkout', async () => {
  const { booking, departure } = await fixture();
  const oldAttempt = await start(booking);
  const oldCheckout = clone(sessionRecords.get(oldAttempt.stripeSessionId));
  assert.equal(
    (await request(`/bookings/${booking.id}/checkout/cancel`, 'POST')).status,
    200,
  );
  await inventory.holdBooking(booking.id, owner.id);
  const currentAttempt = await start(booking);
  assert.notEqual(currentAttempt.id, oldAttempt.id);
  assert.equal(
    (
      await webhook({
        ...oldCheckout,
        status: 'complete',
        payment_status: 'paid',
      })
    ).status,
    200,
  );
  const currentBooking = await Booking.findById(booking.id);
  assert.equal(String(currentBooking.checkoutAttempt), currentAttempt.id);
  assert.equal(currentBooking.paymentStatus, 'checkout');
  assert.equal(currentBooking.checkoutLocked, true);
  assert.equal((await Attempt.findById(oldAttempt.id)).status, 'refunded');
  assert.equal((await Departure.findById(departure.id)).reservedSeats, 2);
});

test('pending refunds are retrieved until succeeded without another refund creation', async () => {
  const { booking } = await fixture();
  const attempt = await start(booking);
  const checkout = clone(sessionRecords.get(attempt.stripeSessionId));
  assert.equal(
    (await request(`/bookings/${booking.id}/checkout/cancel`, 'POST')).status,
    200,
  );
  pendingRefund = true;
  const count = refunds.size;
  assert.equal(
    (await webhook({ ...checkout, status: 'complete', payment_status: 'paid' }))
      .status,
    200,
  );
  const waiting = await Attempt.findById(attempt.id);
  assert.equal(waiting.status, 'refund_pending');
  assert.ok(waiting.refundId);
  assert.equal(
    (await Booking.findById(booking.id)).paymentStatus,
    'refund_pending',
  );
  const providerRefund = [...refunds.values()].find(
    (result) => result.id === waiting.refundId,
  );
  providerRefund.status = 'succeeded';
  pendingRefund = false;
  await payments.reconcile();
  assert.equal((await Attempt.findById(attempt.id)).status, 'refunded');
  assert.equal((await Booking.findById(booking.id)).paymentStatus, 'refunded');
  assert.equal(refunds.size - count, 1);
});
