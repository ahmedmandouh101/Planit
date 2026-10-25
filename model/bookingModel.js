const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  tour: {
    type: mongoose.Schema.ObjectId,
    ref: 'Tour',
    required: [true, 'Booking must belong to a tour'],
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Booking must belong to a user'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
    // select: false
  },
  price: {
    type: Number,
    required: [true, 'Booking must have a price'],
  },
  departureDate: { type: Date, required: true },
  guests: { type: Number, required: true, min: 1, validate: Number.isInteger },
  unitPrice: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ['USD'], default: 'USD' },
  tourName: { type: String, required: true },
  status: { type: String, enum: ['pending', 'cancelled'], default: 'pending' },
  cancelledAt: Date,
  requestId: String,
  departure: { type: mongoose.Schema.ObjectId, ref: 'Departure' },
  holdStatus: { type: String, enum: ['none', 'held', 'expired', 'released'], default: 'none' },
  holdExpiresAt: Date,
  paid: {
    type: Boolean,
    default: false,
  },
});
bookingSchema.index({ user: 1, requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } });
bookingSchema.index({ user: 1, tour: 1, departureDate: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
bookingSchema.index({ user: 1, createdAt: -1, _id: -1 });
bookingSchema.index({ departure: 1, holdStatus: 1, holdExpiresAt: 1 });

bookingSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'tour',
    select: 'name',
  });
  next();
});

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
