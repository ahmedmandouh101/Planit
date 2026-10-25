const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    tour: { type: mongoose.Schema.ObjectId, ref: 'Tour', required: true },
    date: { type: Date, required: true },
    capacity: {
      type: Number,
      required: true,
      min: 1,
      max: 1000,
      validate: Number.isInteger,
    },
    reservedSeats: { type: Number, default: 0, min: 0 },
    closed: { type: Boolean, default: false },
  },
  { timestamps: true },
);
schema.index({ tour: 1, date: 1 }, { unique: true });
module.exports = mongoose.model('Departure', schema);
