const mongoose = require('mongoose');

const placeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'A place must have a name'],
    unique: true,
  },
  about: {
    type: String,
  },
  // embedding locations relationships with places ( 1 to 1 )
  location: {
    type: {
      type: String,
      default: 'Point',
      enum: ['Point'],
    },
    coordinates: [Number],
    address: String,
    description: String,
    day: Number,
  },
  avgRate: {
    type: Number,
    required: [true, 'A place must have a rate'],
  },
  town: {
    type: String,
    required: [true, 'A place must have a town'],
  },
  type: {
    type: String,
    required: [true, 'A place must have a type'],
    enum: ['hotel', 'restaurant', 'entertainment'],
  },
  avgPrice: {
    type: Number,
    required: [true, 'A place must have an average price'],
  },
  imageCover: {
      type: String,
      required: [true, 'A place must have a imageCover'],
  }
});


// Compile the schema into a model
const Place = mongoose.model('Place', placeSchema);

module.exports = Place;

