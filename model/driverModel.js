const mongoose = require('mongoose');

const DriverSchema = new mongoose.Schema({
 name: {
    type: String,
    required: [true, 'A Driver must have a name'],
    unique: true,
  },
  age:{
    type: Number,
    required: [true, 'A Driver must have an age'],
  },
  phone: {
    type: String,
    required: [true, 'A Driver must have a phone'],
    unique: true,
  },
  car: {
    type: String,
    required: [true, 'A Driver must have a car'],
  },
  location: {
    type: String,
    required: [true, 'A Driver must have a location'],
  },
  rating:{
      type: Number,
      default: 4.5,
      min: [1, 'ratings must be above 1'],
      max: [5, 'ratings must be below 5'],
      set: (val) => Math.round(val * 10) / 10,
  },
  image: {
      type: String,
      required: [true, 'A Driver must have a imageCover'],
  }
});
const Driver = mongoose.model('Driver', DriverSchema);

module.exports = Driver;