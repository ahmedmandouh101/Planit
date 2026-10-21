// eslint-disable-next-line import/no-extraneous-dependencies
const Tour = require('../model/tourModel');
const Booking = require('../model/bookingModel');
const catchAsync = require('../utils/catchAsync');
// eslint-disable-next-line import/order, import/newline-after-import
// eslint-disable-next-line import/order
const AppError = require('../utils/AppError');
// const AppError = require('../utils/AppError');
const factory = require('./handlerFactory');

// console.log( process.env.STRIPE_SECRET_KEY);
exports.getcheckoutSession = catchAsync(async (req, res, next) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return next(new AppError('Payments are not configured', 503));
  }
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  // 1) get the currently booked tour
  const tour = await Tour.findById(req.params.tourId);
  if (!tour) return next(new AppError('No tour found with that ID', 404));
  // 2) create checkout session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment', // Specify the mode here
    success_url: `${req.protocol}://${req.get('host')}/?tour=${req.params.tourId}&user=${req.user.id}&price=${tour.price}`,
    cancel_url: `${req.protocol}://${req.get('host')}/tour/${tour.slug}`,
    customer_email: req.user.email,
    client_reference_id: req.params.tourId,

    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${tour.name} Tour`,
            description: tour.summary,
            // images: tour.images, // If you need to include images, handle them separately
          },
          unit_amount: tour.price * 100, // Amount in cents
        },
        quantity: 1,
      },
    ],
  });

  // 3) send session to client
  res.status(200).json({
    status: 'success',
    session,
  });
});

exports.createBookingCheckout = catchAsync(async (req, res, next) => {
  const { tour, user, price } = req.query;

  if (!tour && !user && !price) return next();
  await Booking.create({ tour, user, price });

  res.redirect(req.originalUrl.split('?')[0]);
});


exports.createBooking = factory.createOne(Booking);
exports.getBooking = factory.getOne(Booking);
exports.getAllBooking = factory.getAll(Booking);
exports.updateBooking = factory.updateOne(Booking);
exports.deleteBooking = factory.deleteOne(Booking);
