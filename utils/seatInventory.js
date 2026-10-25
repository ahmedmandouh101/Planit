const mongoose = require('mongoose');
const Booking = require('../model/bookingModel');
const Departure = require('../model/departureModel');
const Tour = require('../model/tourModel');
const AppError = require('./AppError');

const HOLD_DURATION_MS = 15 * 60 * 1000;
const today = () => new Date(new Date().toISOString().slice(0, 10));

async function transaction(work) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session), {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      maxCommitTimeMS: 5000,
    });
  } catch (error) {
    if (error.code === 20 || error.codeName === 'IllegalOperation')
      throw new AppError(
        'Seat inventory needs a MongoDB replica set. Please contact support.',
        503,
      );
    throw error;
  } finally {
    await session.endSession();
  }
}

async function decrement(departure, seats, session) {
  if (!seats) return;
  const result = await Departure.updateOne(
    { _id: departure, reservedSeats: { $gte: seats } },
    { $inc: { reservedSeats: -seats } },
    { session },
  );
  if (!result.matchedCount)
    throw new AppError(
      'Seat inventory needs attention. Please contact support.',
      503,
    );
}

async function expireDeparture(identifier, session, now = new Date()) {
  const expired = await Booking.find({
    departure: identifier,
    holdStatus: 'held',
    paid: false,
    checkoutLocked: { $ne: true },
    holdExpiresAt: { $lte: now },
  }).session(session);
  if (!expired.length) return;
  await decrement(
    identifier,
    expired.reduce((total, booking) => total + booking.guests, 0),
    session,
  );
  await Booking.updateMany(
    { _id: { $in: expired.map((booking) => booking.id) } },
    { $set: { holdStatus: 'expired' } },
    { session },
  );
}

async function ownedBooking(identifier, user, session) {
  const booking = await Booking.findOne({ _id: identifier, user }).session(
    session,
  );
  if (!booking) throw new AppError('Booking not found.', 404);
  return booking;
}

async function holdBooking(identifier, user) {
  return transaction(async (session) => {
    const booking = await ownedBooking(identifier, user, session);
    if (booking.checkoutLocked) throw new AppError('A payment checkout is active. Continue or cancel checkout before changing the seat hold.', 409);
    if (
      booking.status !== 'pending' ||
      booking.paid ||
      !booking.departureDate ||
      booking.departureDate <= today()
    )
      throw new AppError(
        'Only future unpaid pending requests can hold seats.',
        409,
      );
    const tour = await Tour.findById(
      booking.populated('tour') || booking.tour?._id,
    ).session(session);
    if (
      !tour ||
      tour.secretTour ||
      !Number.isInteger(booking.guests) ||
      booking.guests < 1 ||
      !Number.isInteger(tour.MaxGroupSize) ||
      booking.guests > tour.MaxGroupSize ||
      (tour.startDates.length &&
        !tour.startDates.some(
          (date) =>
            date.toISOString().slice(0, 10) ===
            booking.departureDate.toISOString().slice(0, 10),
        ))
    )
      throw new AppError(
        'This booking is no longer eligible for a seat hold.',
        409,
      );
    const departure = await Departure.findOne({
      tour: tour.id,
      date: booking.departureDate,
    }).session(session);
    if (!departure)
      throw new AppError(
        'Seat inventory has not been configured for this departure.',
        409,
      );
    const now = new Date();
    await expireDeparture(departure.id, session, now);
    if (booking.holdStatus === 'held' && booking.holdExpiresAt > now)
      return booking;
    if (departure.closed)
      throw new AppError('This departure is closed for new seat holds.', 409);
    const reserved = await Departure.findOneAndUpdate(
      {
        _id: departure.id,
        closed: false,
        $expr: {
          $lte: [{ $add: ['$reservedSeats', booking.guests] }, '$capacity'],
        },
      },
      { $inc: { reservedSeats: booking.guests } },
      { new: true, session },
    );
    if (!reserved)
      throw new AppError(
        'Not enough seats remain for this group. Choose another departure or fewer guests.',
        409,
      );
    return Booking.findOneAndUpdate(
      { _id: booking.id, user, status: 'pending', paid: false },
      {
        $set: {
          departure: departure.id,
          holdStatus: 'held',
          holdExpiresAt: new Date(
            Math.min(
              now.getTime() + HOLD_DURATION_MS,
              booking.departureDate.getTime(),
            ),
          ),
        },
      },
      { new: true, session },
    );
  });
}

async function releaseBooking(identifier, user, cancel = false) {
  return transaction(async (session) => {
    const booking = await ownedBooking(identifier, user, session);
    if (booking.checkoutLocked) throw new AppError('Cancel payment checkout before releasing seats or cancelling this booking.', 409);
    if (cancel && booking.status === 'cancelled') return booking;
    if (
      booking.status !== 'pending' ||
      booking.paid ||
      !booking.departureDate ||
      booking.departureDate <= today()
    )
      throw new AppError(
        'Only future unpaid pending requests can be changed here.',
        409,
      );
    if (booking.holdStatus === 'held')
      await decrement(booking.departure, booking.guests, session);
    const changes = {
      holdStatus:
        booking.holdStatus === 'held'
          ? 'released'
          : booking.holdStatus || 'none',
    };
    if (cancel)
      Object.assign(changes, { status: 'cancelled', cancelledAt: new Date() });
    return Booking.findByIdAndUpdate(
      booking.id,
      { $set: changes, $unset: { holdExpiresAt: 1 } },
      { new: true, session },
    );
  });
}

async function expireAllHolds(filter = {}) {
  const candidates = await Booking.find({
    ...filter,
    holdStatus: 'held',
    paid: false,
    checkoutLocked: { $ne: true },
    holdExpiresAt: { $lte: new Date() },
  })
    .select('departure')
    .limit(100)
    .lean();
  for (const identifier of new Set(
    candidates.map((booking) => String(booking.departure)),
  ))
    await transaction((session) => expireDeparture(identifier, session));
}

function startExpiryWorker() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await expireAllHolds();
    } catch {
      console.warn(
        'Seat hold cleanup failed; availability requests will retry cleanup.',
      );
    } finally {
      running = false;
    }
  }, 30000);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = {
  transaction,
  decrement,
  expireDeparture,
  holdBooking,
  releaseBooking,
  expireAllHolds,
  startExpiryWorker,
};
