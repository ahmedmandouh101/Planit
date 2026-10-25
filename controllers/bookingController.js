const Booking = require('../model/bookingModel');
const factory = require('./handlerFactory');
const AppError = require('../utils/AppError');

exports.protectInventory = (req, res, next) => {
  if (!['PATCH', 'DELETE'].includes(req.method)) return next();
  return next(new AppError('Booking writes must use the seat-hold and cancellation endpoints. Generic updates and deletion are disabled.', 409));
};
exports.getBooking = factory.getOne(Booking);
exports.getAllBooking = factory.getAll(Booking);
