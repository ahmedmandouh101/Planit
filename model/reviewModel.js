const mongoose = require('mongoose');
const Tour = require('./tourModel');

const reviewSchema = new mongoose.Schema({
  review: {
    type: String,
    required: true,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
  },
  createdAt: {
    type: Date,
    default: Date.now(),
  },
  tour: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tour',
    // required: [true, 'A review must belong to tour'],
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'A review must belong to user'],
  },
  place: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    // required: [true, 'A review must belong to place'],
  },
});

// we use this index to ensure that one user cannot write multiple reviews for the same tour
reviewSchema.index({ tour: 1, user: 1 }, { unique: true });

reviewSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'user',
    select: 'name',
  });

  // .populate({
  //   path: 'tour',
  //   select: 'name',
  // })
  //   .populate({
  //     path: 'place',
  //     select: 'name',
  //   })

  next();
});

reviewSchema.pre(/^findOneAnd/, async function (next) {
  // Use this.model.findOne() to retrieve the document based on the current query
  this.r = await this.model.findOne(this.getQuery());
  next();
});

// Post middleware for findOneAnd... operations
reviewSchema.post(/^findOneAnd/, async (doc) => {
  // Check if the document exists (it was found and updated/deleted)
  if (doc) {
    // Calculate and update average ratings based on the document's tour
    await doc.constructor.clacAverageRatings(doc.tour);
  }
});

// Static method to calculate average ratings
reviewSchema.statics.clacAverageRatings = async function (tourId) {
  const stats = await this.aggregate([
    {
      $match: { tour: tourId },
    },
    {
      $group: {
        _id: '$tour',
        nRating: { $sum: 1 },
        avgRating: { $avg: '$rating' },
      },
    },
  ]);

  // Update the Tour model with the calculated ratings
  if (stats.length > 0) {
    await Tour.findByIdAndUpdate(tourId, {
      ratingsQuantity: stats[0].nRating,
      ratingsAverage: stats[0].avgRating,
    });
  } else {
    await Tour.findByIdAndUpdate(tourId, {
      ratingsQuantity: 0,
      ratingsAverage: 4.5,
    });
  }
};

// Post middleware for 'save' operation
reviewSchema.post('save', async function () {
  // Calculate and update average ratings after saving a new review
  await this.constructor.clacAverageRatings(this.tour);
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;

// reviewSchema.statics.clacAverageRatings = async function (tourId) {
//   const stats = await this.aggregate([
// // static function TO simply use  aggreate in it
//     {
//       $match: { tour: tourId },
//     },
//     {
//       $group: {
//         _id: '$tour',
//         nRating: { $sum: 1 },
//         avgRating: { $avg: '$rating' },
//       },
//     },
//   ]);

//   if (stats.length > 0) {
//     await Tour.findByIdAndUpdate(tourId, {
//       ratingsQuantity: stats[0].nRating,
//       ratingsAverage: stats[0].avgRating
//     });
//   } else {
//     await Tour.findByIdAndUpdate(tourId, {
//       ratingsQuantity: 0,
//       ratingsAverage: 4.5
//     });
//   }
// };

// reviewSchema.post('save', function() {
//   // this points to current review
//   this.constructor.clacAverageRatings(this.tour);
// });

// // findByIdAndUpdate
// // findByIdAndDelete
// reviewSchema.pre(/^findOneAnd/, async function(next) {
//   this.r = await this.model.findOne();
//   // console.log(this.r);
//   next();
// });

// reviewSchema.post(/^findOneAnd/, async function() {
//   // await this.findOne(); does NOT work here, query has already executed
//   await this.r.constructor.clacAverageRatings(this.r.tour);
// });
