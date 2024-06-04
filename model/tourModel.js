const mongoose = require('mongoose'); // js driver for manpulation the database
const slugify = require('slugify');
// const User = require('./userModel');

const tourSchema = new mongoose.Schema(
  {
    // create a schema for the tour and make in it some validation
    name: {
      type: String,
      required: [true, ' tour must have a name'], //validator
      unique: true, // not a validator
      trim: true,
      maxLength: [40, ' tour must have below 40 characters'],
      minLength: [10, ' tour must have above 10 characters'], // validator for strings
    },
    slug: String,
    duration: Number,
    MaxGroupSize: Number,
    difficulty: {
      type: String,
      trim: true,
      enum: {
        values: ['easy', 'medium', 'difficult'], // validator for strings
        message: 'difficulty must be either medium ,easy or difficult',
      },
    },
    ratingsAverage: {
      type: Number,
      default: 4.5,
      min: [1, 'ratings must be above 1'], // validator for number and dates .. not for strings
      max: [5, 'ratings must be below 5'],
      set: (val) => Math.round(val * 10) / 10, // 4.66666 => 46.6666 => 47 => 4.7
    },
    ratingsQuantity: {
      type: Number,
      default: 0,
    },
    price: {
      type: Number,
      required: [true, ' tour must have a price'],
    },
    priceDiscount: {
      type: Number,
      validate: {
        // this only points to the current document and this validator is a custom validator
        validator: function (val) {
          return val < this.price;
        },
        message: 'price discount must be less than price',
      },
    },
    summary: {
      type: String,
      required: [true, 'tour must have a summary'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    imageCover: {
      type: String,
      required: [true, 'tour must have a imageCover'],
    },
    images: [String],
    startDates: [Date],
    secretTour: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now(),
      select: false, // to not appear in api
    },
    startLocation: {
      // geoJSON
      type: {
        type: String,
        default: 'Point',
        enum: ['Point'],
      },
      coordinates: [Number],
      address: String,
      description: String,
    },
    locations: [
      // embedding locations relationships with tours ( few to few )
      {
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
    ],
    guides: [
      {
        // relate the tour with the user ( guide) by referencing
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);
// indexes : optimizing database performance, particularly for read-heavy workloads where data retrieval speed is critical. However, it's essential to design indexes carefully to avoid unnecessary overhead and ensure that they align with the specific query patterns and usage characteristics of your application.
tourSchema.index({ price: 1, ratingsAverage: -1 }); // compound
tourSchema.index({ slug: 1 });

tourSchema.virtual('durationWeeks').get(function () {
  return this.duration / 7;
});

// virtual populate
tourSchema.virtual('reviews', {
  ref: 'Review',
  foreignField: 'tour', // the field in review model which related with
  localField: '_id', //   here
});

// mongoose also have access to the middlware and it call middlware or hooks ex pre hook and post hook

// DOCUMENT MIDDLEWARE: runs before .save() and .create()
tourSchema.pre('save', function (next) {
  this.slug = slugify(this.name, { lower: true }); // this referer to the current document
  next();
});

tourSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'guides',
    select: '-__v -passwordChangedAt',
  });
  next();
});

// to add tourGuide to tour by embedding
// tourSchema.pre('save', async function (next) {
//   const guidesPromises = this.guides.map(async (id) => await User.findById(id));
//   this.guides = await Promise.all(guidesPromises);
//   next();
// });

// tourSchema.pre('save', function (next) {
//   console.log('Will save document...');
//   next();
// });

// tourSchema.post('save', function (doc, next) {
//   console.log(doc);
//   next();
// });

// // QUERY MIDDLEWARE
// // tourSchema.pre('find', function(next) {
// tourSchema.pre(/^find/, function (next) {  // this regex refere for all qurey starts with find
//   this.find({ secretTour: { $ne: true } });  this here refere to the current query

//   this.start = Date.now();
//   next();
// });

// tourSchema.post(/^find/, function (docs, next) { // after the query done
//   console.log(`Query took ${Date.now() - this.start} milliseconds!`);
//   next();
// });

// // AGGREGATION MIDDLEWARE   allow us to put middleware after and before the aggregation
// tourSchema.pre('aggregate', function (next) {
//   this.pipeline().unshift({ $match: { secretTour: { $ne: true } } });

//   console.log(this.pipeline());
//   next();
// });

const Tour = mongoose.model('Tour', tourSchema); // create a model for Tour (document) with the schema which we create

module.exports = Tour;
