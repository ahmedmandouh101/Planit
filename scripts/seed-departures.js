const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') });
const Tour = require('../model/tourModel');
require('../model/userModel');
const Booking = require('../model/bookingModel');
const Departure = require('../model/departureModel');

async function seed() {
  if (process.env.NODE_ENV !== 'development')
    throw new Error('Departure seeding requires NODE_ENV=development.');
  await mongoose.connect(process.env.DATABASE_LOCAL || process.env.DATABASE, {
    serverSelectionTimeoutMS: 5000,
  });
  await Departure.init();
  const today = new Date(new Date().toISOString().slice(0, 10));
  const tours = await Tour.find({
    name: { $in: ['Demo Cairo Heritage Walk', 'Demo Luxor Discovery Tour'] },
  });
  for (const tour of tours) {
    if (
      !Number.isInteger(tour.MaxGroupSize) ||
      tour.MaxGroupSize < 1 ||
      tour.MaxGroupSize > 1000
    )
      continue;
    const requested = await Booking.distinct('departureDate', {
      tour: tour.id,
      status: 'pending',
      paid: false,
      departureDate: { $gt: today },
    });
    const dates = tour.startDates.length
      ? tour.startDates
      : [
          ...requested,
          ...[7, 14, 21].map(
            (days) => new Date(today.getTime() + days * 86400000),
          ),
        ];
    for (const date of new Set(
      dates
        .filter((value) => value > today)
        .map((value) => value.toISOString().slice(0, 10)),
    )) {
      await Departure.updateOne(
        { tour: tour.id, date: new Date(date) },
        {
          $setOnInsert: {
            capacity: tour.MaxGroupSize,
            reservedSeats: 0,
            closed: false,
          },
        },
        { upsert: true },
      );
    }
  }
  console.log(
    'Demo departures are ready. Existing capacities and seat holds were preserved.',
  );
}
seed()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
