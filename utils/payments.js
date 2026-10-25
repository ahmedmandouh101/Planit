const mongoose = require('mongoose');
const Booking = require('../model/bookingModel');
const Attempt = require('../model/paymentAttemptModel');
const inventory = require('./seatInventory');
const stripeClient = require('./stripeClient');
const AppError = require('./AppError');

function validSession(attempt, checkout) {
  return (
    checkout.livemode === false &&
    checkout.mode === 'payment' &&
    checkout.client_reference_id === String(attempt.booking) &&
    checkout.metadata?.attemptId === attempt.id &&
    checkout.metadata?.bookingId === String(attempt.booking) &&
    checkout.amount_total === attempt.amount &&
    checkout.currency === attempt.currency &&
    (!attempt.stripeSessionId || checkout.id === attempt.stripeSessionId)
  );
}

async function prepare(bookingId, user) {
  const origin = new URL(process.env.PUBLIC_APP_URL);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    (origin.protocol === 'http:' &&
      !['localhost', '127.0.0.1'].includes(origin.hostname))
  )
    throw new AppError(
      'Configure a trusted HTTPS application URL for checkout.',
      503,
    );
  const work = () =>
    inventory.transaction(async (session) => {
      const booking = await Booking.findOne({ _id: bookingId, user }).session(
        session,
      );
      if (!booking) throw new AppError('Booking not found.', 404);
      const active = await Attempt.findOne({
        booking: booking.id,
        active: true,
      }).session(session);
      if (active) return active;
      const now = Date.now();
      if (
        booking.status !== 'pending' ||
        booking.paid ||
        booking.holdStatus !== 'held' ||
        !(booking.holdExpiresAt > new Date()) ||
        booking.checkoutLocked
      )
        throw new AppError(
          'Acquire a valid seat hold before starting checkout.',
          409,
        );
      const amount = Math.round(booking.price * 100);
      if (
        !Number.isSafeInteger(amount) ||
        amount < 50 ||
        amount > 99999999 ||
        booking.currency !== 'USD'
      )
        throw new AppError(
          'Test checkout requires a valid USD total of at least $0.50.',
          409,
        );
      if (booking.departureDate.getTime() <= now + 37 * 60000)
        throw new AppError(
          'This departure is too close to start a new checkout.',
          409,
        );
      const attempt = (
        await Attempt.create(
          [
            {
              booking: booking.id,
              user,
              amount,
              currency: 'usd',
              tourName: booking.tourName,
              origin: origin.origin,
              expiresAt: new Date(Math.floor((now + 35 * 60000) / 1000) * 1000),
            },
          ],
          { session },
        )
      )[0];
      await Booking.updateOne(
        { _id: booking.id },
        {
          $set: {
            checkoutLocked: true,
            checkoutAttempt: attempt.id,
            paymentStatus: 'checkout',
            holdExpiresAt: new Date(now + 37 * 60000),
          },
        },
        { session },
      );
      return attempt;
    });
  try {
    return await work();
  } catch (error) {
    if (error.code !== 11000) throw error;
    return work();
  }
}

async function applySession(identifier, checkout) {
  return inventory.transaction(async (session) => {
    const attempt = await Attempt.findById(identifier).session(session);
    if (!attempt) return null;
    if (!validSession(attempt, checkout))
      throw new AppError(
        'Checkout details do not match the stored payment attempt.',
        400,
      );
    if (['paid', 'refunded', 'refund_pending'].includes(attempt.status))
      return attempt;
    const booking = await Booking.findById(attempt.booking).session(session);
    if (!booking)
      throw new AppError(
        'Payment booking is unavailable for reconciliation.',
        503,
      );
    const current = String(booking.checkoutAttempt) === attempt.id;
    if (checkout.status === 'complete' && checkout.payment_status === 'paid') {
      const paymentIntent =
        typeof checkout.payment_intent === 'string'
          ? checkout.payment_intent
          : checkout.payment_intent?.id;
      if (!paymentIntent?.startsWith('pi_'))
        throw new AppError(
          'A paid checkout must identify its payment intent.',
          400,
        );
      const fulfilled =
        current &&
        attempt.active &&
        booking.status === 'pending' &&
        booking.checkoutLocked &&
        booking.holdStatus === 'held' &&
        !booking.paid;
      if (fulfilled) {
        await Booking.updateOne(
          { _id: booking.id },
          {
            $set: {
              status: 'confirmed',
              paid: true,
              paymentStatus: 'paid',
              holdStatus: 'confirmed',
              checkoutLocked: false,
            },
            $unset: { holdExpiresAt: 1 },
          },
          { session },
        );
      } else if (current && !booking.paid) {
        if (booking.holdStatus === 'held')
          await inventory.decrement(booking.departure, booking.guests, session);
        await Booking.updateOne(
          { _id: booking.id },
          {
            $set: {
              status: 'cancelled',
              paymentStatus: 'refund_pending',
              checkoutLocked: false,
              holdStatus: 'released',
              cancelledAt: new Date(),
            },
            $unset: { holdExpiresAt: 1 },
          },
          { session },
        );
      }
      return Attempt.findByIdAndUpdate(
        attempt.id,
        {
          $set: {
            status: fulfilled ? 'paid' : 'refund_pending',
            active: false,
            stripeSessionId: checkout.id,
            paymentIntentId: paymentIntent,
          },
        },
        { new: true, session },
      );
    }
    if (checkout.status === 'expired') {
      if (attempt.status === 'expired') return attempt;
      if (current && booking.checkoutLocked && !booking.paid) {
        if (booking.holdStatus === 'held')
          await inventory.decrement(booking.departure, booking.guests, session);
        await Booking.updateOne(
          { _id: booking.id },
          {
            $set: {
              checkoutLocked: false,
              paymentStatus: 'unpaid',
              holdStatus: 'released',
            },
            $unset: { holdExpiresAt: 1 },
          },
          { session },
        );
      }
      return Attempt.findByIdAndUpdate(
        attempt.id,
        {
          $set: {
            status: 'expired',
            active: false,
            stripeSessionId: checkout.id,
          },
        },
        { new: true, session },
      );
    }
    if (attempt.status === 'expired') return attempt;
    return Attempt.findByIdAndUpdate(
      attempt.id,
      {
        $set: {
          status: 'open',
          stripeSessionId: checkout.id,
          checkoutUrl: checkout.url || attempt.checkoutUrl,
        },
      },
      { new: true, session },
    );
  });
}

async function refund(attempt) {
  if (attempt?.status !== 'refund_pending') return;
  const result = attempt.refundId
    ? await stripeClient.getClient().refunds.retrieve(attempt.refundId)
    : await stripeClient
        .getClient()
        .refunds.create(
          { payment_intent: attempt.paymentIntentId },
          { idempotencyKey: `planit-refund-${attempt.id}` },
        );
  await Attempt.updateOne(
    { _id: attempt.id, status: 'refund_pending' },
    { $set: { refundId: result.id } },
  );
  if (result.status !== 'succeeded') return;
  await inventory.transaction(async (session) => {
    const updated = await Attempt.findOneAndUpdate(
      { _id: attempt.id, status: 'refund_pending' },
      { $set: { status: 'refunded', refundId: result.id } },
      { new: true, session },
    );
    if (updated)
      await Booking.updateOne(
        {
          _id: updated.booking,
          checkoutAttempt: updated.id,
          paymentStatus: 'refund_pending',
        },
        { $set: { paymentStatus: 'refunded' } },
        { session },
      );
  });
}

async function openSession(attempt) {
  const stripe = stripeClient.getClient();
  const checkout = attempt.stripeSessionId
    ? await stripe.checkout.sessions.retrieve(attempt.stripeSessionId)
    : await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          payment_method_types: ['card'],
          client_reference_id: String(attempt.booking),
          metadata: {
            bookingId: String(attempt.booking),
            attemptId: attempt.id,
          },
          success_url: `${attempt.origin}/#checkout=returned`,
          cancel_url: `${attempt.origin}/#checkout=cancelled`,
          expires_at: Math.floor(attempt.expiresAt.getTime() / 1000),
          line_items: [
            {
              price_data: {
                currency: attempt.currency,
                unit_amount: attempt.amount,
                product_data: { name: attempt.tourName },
              },
              quantity: 1,
            },
          ],
        },
        { idempotencyKey: `planit-checkout-${attempt.id}` },
      );
  const updated = await applySession(attempt.id, checkout);
  await refund(updated);
  return { attempt: updated, checkout };
}

async function checkout(bookingId, user) {
  if (!stripeClient.isConfigured())
    throw new AppError(
      'Stripe test checkout is not configured yet. Please try again later.',
      503,
    );
  stripeClient.getClient();
  const attempt = await prepare(bookingId, user);
  const result = await openSession(attempt);
  if (result.attempt.status !== 'open' || result.checkout.status !== 'open')
    throw new AppError(
      'Checkout is no longer open. Refresh your bookings to see its status.',
      409,
    );
  const url = new URL(result.checkout.url);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com')
    throw new AppError('Stripe did not return a valid checkout address.', 503);
  return { url: url.href };
}

async function cancelCheckout(bookingId, user) {
  const booking = await Booking.findOne({ _id: bookingId, user });
  if (!booking) throw new AppError('Booking not found.', 404);
  const attempt = await Attempt.findOne({ booking: booking.id, active: true });
  if (!attempt) return;
  const { checkout: existing } = await openSession(attempt);
  let latest = existing;
  if (existing.status === 'open') {
    try {
      latest = await stripeClient
        .getClient()
        .checkout.sessions.expire(existing.id);
    } catch {
      latest = await stripeClient
        .getClient()
        .checkout.sessions.retrieve(existing.id);
    }
  }
  const updated = await applySession(attempt.id, latest);
  await refund(updated);
  if (updated.status === 'paid')
    throw new AppError(
      'Payment already completed. The booking is confirmed.',
      409,
    );
  if (updated.active)
    throw new AppError(
      'Stripe has not closed checkout yet. Seats remain protected; please retry.',
      409,
    );
}

async function handleEvent(event) {
  if (event.livemode !== false)
    throw new AppError('Only Stripe test events are accepted.', 400);
  if (
    ![
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.expired',
    ].includes(event.type)
  )
    return;
  const checkout = event.data.object;
  if (!mongoose.isObjectIdOrHexString(checkout.metadata?.attemptId)) return;
  const attempt = await applySession(checkout.metadata.attemptId, checkout);
  await refund(attempt);
}

async function reconcile() {
  if (!stripeClient.isConfigured()) return;
  const attempts = await Attempt.find({
    $or: [{ active: true }, { status: 'refund_pending' }],
  })
    .sort('updatedAt')
    .limit(20);
  for (const attempt of attempts) {
    try {
      if (attempt.status === 'refund_pending') await refund(attempt);
      else await openSession(attempt);
    } catch {
      console.warn(
        'A Stripe test attempt is awaiting reconciliation; its seats remain protected.',
      );
    }
  }
}

function startWorker() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await reconcile();
    } catch {
      console.warn('Stripe reconciliation will retry.');
    } finally {
      running = false;
    }
  }, 60000);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = {
  checkout,
  cancelCheckout,
  handleEvent,
  reconcile,
  startWorker,
};
