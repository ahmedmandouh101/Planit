const mongoose = require('mongoose');
const Tour = require('../model/tourModel');
const Booking = require('../model/bookingModel');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const inventory = require('../utils/seatInventory');

const today = () => new Date().toISOString().slice(0, 10);
const invalidId = (identifier) => typeof identifier !== 'string' || !mongoose.isObjectIdOrHexString(identifier);

function bookingData(booking) {
  return {
    _id: booking.id,
    tourName: booking.tourName || booking.tour?.name || 'Unavailable tour',
    departureDate: booking.departureDate,
    guests: booking.guests,
    unitPrice: booking.unitPrice,
    price: booking.price,
    currency: booking.currency || 'USD',
    status: booking.status || 'pending',
    paid: booking.paid,
    createdAt: booking.createdAt,
    cancelledAt: booking.cancelledAt,
    holdStatus: booking.holdStatus || 'none',
    holdExpiresAt: booking.holdExpiresAt,
  };
}

function sameRequest(booking, body) {
  return String(booking.populated('tour') || booking.tour?._id || booking.tour) === body.tourId.toLowerCase() &&
    booking.departureDate?.toISOString().slice(0, 10) === body.departureDate && booking.guests === body.guests;
}

exports.create = catchAsync(async (req, res, next) => {
  const { tourId, departureDate, guests, requestId } = req.body;
  if (typeof requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)) {
    return next(new AppError('A valid request ID is required. Please refresh and try again.', 400));
  }
  if (invalidId(tourId) || typeof departureDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(departureDate) || !Number.isInteger(guests) || guests < 1) {
    return next(new AppError('Choose a valid tour, departure date, and whole number of guests.', 400));
  }
  const date = new Date(`${departureDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== departureDate) return next(new AppError('Choose a valid departure date.', 400));
  const previous = await Booking.findOne({ user: req.user.id, requestId });
  if (previous) {
    if (!sameRequest(previous, req.body)) return next(new AppError('This request ID was already used for different booking details.', 409));
    return res.status(200).json({ status: 'success', data: { booking: bookingData(previous) } });
  }
  if (departureDate <= today()) return next(new AppError('Choose a departure date after today (UTC).', 400));
  const tour = await Tour.findById(tourId);
  if (!tour || tour.secretTour) return next(new AppError('Tour not found.', 404));
  if (!Number.isInteger(tour.MaxGroupSize) || tour.MaxGroupSize < 1) return next(new AppError('This tour is not accepting booking requests yet.', 409));
  if (guests > tour.MaxGroupSize) return next(new AppError(`Choose no more than ${tour.MaxGroupSize} guests.`, 400));
  if (tour.startDates.length && !tour.startDates.some((start) => start.toISOString().slice(0, 10) === departureDate)) return next(new AppError('That departure date is not offered for this tour.', 400));
  const unitCents = Math.round(tour.price * 100);
  const totalCents = unitCents * guests;
  if (!Number.isFinite(tour.price) || tour.price < 0 || !Number.isSafeInteger(unitCents) || !Number.isSafeInteger(totalCents)) return next(new AppError('Tour pricing is unavailable. Please try again later.', 409));
  let booking;
  try {
    booking = await Booking.create({ tour: tour.id, tourName: tour.name, user: req.user.id, departureDate: date, guests, unitPrice: unitCents / 100, price: totalCents / 100, currency: 'USD', status: 'pending', paid: false, requestId });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const duplicate = await Booking.findOne({ user: req.user.id, requestId });
    if (duplicate && sameRequest(duplicate, req.body)) return res.status(200).json({ status: 'success', data: { booking: bookingData(duplicate) } });
    return next(new AppError('You already have a pending request for this tour and date. Check My bookings.', 409));
  }
  return res.status(201).json({ status: 'success', data: { booking: bookingData(booking) } });
});

exports.list = catchAsync(async (req, res, next) => {
  const page = Number(req.query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return next(new AppError('Invalid page number.', 400));
  await inventory.expireAllHolds({ user: req.user.id });
  const bookings = await Booking.find({ user: req.user.id }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 12).limit(13);
  res.status(200).json({ status: 'success', hasMore: bookings.length > 12, data: { bookings: bookings.slice(0, 12).map(bookingData) } });
});

exports.cancel = catchAsync(async (req, res, next) => {
  if (invalidId(req.params.id)) return next(new AppError('Invalid booking ID.', 400));
  const booking = await inventory.releaseBooking(req.params.id, req.user.id, true);
  res.status(200).json({ status: 'success', data: { booking: bookingData(booking) } });
});

exports.hold = catchAsync(async (req, res, next) => {
  if (invalidId(req.params.id)) return next(new AppError('Invalid booking ID.', 400));
  const booking = await inventory.holdBooking(req.params.id, req.user.id);
  res.status(200).json({ status: 'success', data: { booking: bookingData(booking) } });
});

exports.release = catchAsync(async (req, res, next) => {
  if (invalidId(req.params.id)) return next(new AppError('Invalid booking ID.', 400));
  const booking = await inventory.releaseBooking(req.params.id, req.user.id);
  res.status(200).json({ status: 'success', data: { booking: bookingData(booking) } });
});
