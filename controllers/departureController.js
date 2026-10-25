const mongoose = require('mongoose');
const Departure = require('../model/departureModel');
const Tour = require('../model/tourModel');
const inventory = require('../utils/seatInventory');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

function data(departure) {
  return {
    _id: departure.id,
    date: departure.date,
    capacity: departure.capacity,
    availableSeats: departure.closed
      ? 0
      : departure.capacity - departure.reservedSeats,
    closed: departure.closed,
  };
}

exports.list = catchAsync(async (req, res, next) => {
  if (
    typeof req.query.tourId !== 'string' ||
    !mongoose.isObjectIdOrHexString(req.query.tourId)
  )
    return next(new AppError('A valid tour ID is required.', 400));
  const tour = await Tour.findById(req.query.tourId);
  if (!tour || tour.secretTour)
    return next(new AppError('Tour not found.', 404));
  const departures = await inventory.transaction(async (session) => {
    const records = await Departure.find({
      tour: tour.id,
      date: { $gt: new Date(new Date().toISOString().slice(0, 10)) },
    })
      .sort('date')
      .limit(60)
      .session(session);
    for (const departure of records)
      await inventory.expireDeparture(departure.id, session);
    return Departure.find({
      _id: { $in: records.map((departure) => departure.id) },
    })
      .sort('date')
      .session(session);
  });
  res
    .status(200)
    .json({ status: 'success', data: { departures: departures.map(data) } });
});

exports.configure = catchAsync(async (req, res, next) => {
  const { tourId, date, capacity, closed } = req.body;
  if (
    typeof tourId !== 'string' ||
    !mongoose.isObjectIdOrHexString(tourId) ||
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > 1000 ||
    (closed !== undefined && typeof closed !== 'boolean')
  )
    return next(
      new AppError(
        'Provide a tour ID, future date, capacity from 1 to 1000, and a boolean closed flag.',
        400,
      ),
    );
  const departureDate = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(departureDate.getTime()) ||
    departureDate.toISOString().slice(0, 10) !== date ||
    date <= new Date().toISOString().slice(0, 10)
  )
    return next(new AppError('Choose a valid date after today (UTC).', 400));
  const tour = await Tour.findById(tourId);
  if (!tour || tour.secretTour)
    return next(new AppError('Tour not found.', 404));
  if (
    tour.startDates.length &&
    !tour.startDates.some((start) => start.toISOString().slice(0, 10) === date)
  )
    return next(new AppError('Choose a date offered by this tour.', 400));
  let departure;
  try {
    departure = await inventory.transaction(async (session) => {
      const existing = await Departure.findOne({
        tour: tour.id,
        date: departureDate,
      }).session(session);
      if (!existing)
        return (
          await Departure.create(
            [
              {
                tour: tour.id,
                date: departureDate,
                capacity,
                closed: closed ?? false,
              },
            ],
            { session },
          )
        )[0];
      await inventory.expireDeparture(existing.id, session);
      const updated = await Departure.findOneAndUpdate(
        { _id: existing.id, reservedSeats: { $lte: capacity } },
        { $set: { capacity, ...(closed === undefined ? {} : { closed }) } },
        { new: true, session, runValidators: true },
      );
      if (!updated)
        throw new AppError(
          'Capacity cannot be lower than the seats currently held.',
          409,
        );
      return updated;
    });
  } catch (error) {
    if (error.code === 11000)
      return next(
        new AppError(
          'This departure was configured concurrently. Please retry.',
          409,
        ),
      );
    throw error;
  }
  res
    .status(200)
    .json({ status: 'success', data: { departure: data(departure) } });
});
