const Review = require('../model/reviewModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
// const catchAsync = require('../utils/catchAsync');

exports.setTourUserIds = (req, res, next) => {
  // Allow nested routes
  if (req.params.tourId) req.body.tour = req.params.tourId;
  req.body.user = req.user.id;
  next();
};

exports.getAllReviews = factory.getAll(Review);
exports.authorizeReviewMutation = catchAsync(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  if (!review || (req.params.tourId && String(review.tour) !== req.params.tourId)) {
    return next(new AppError('No review found with that ID', 404));
  }
  const ownerId = review.user && (review.user._id || review.user);
  if (req.user.role !== 'admin' && String(ownerId) !== String(req.user.id)) {
    return next(new AppError('You do not have permission to modify this review', 403));
  }
  req.body = Object.fromEntries(
    Object.entries(req.body || {}).filter(([field]) => ['review', 'rating'].includes(field)),
  );
  next();
});
exports.getReview = factory.getOne(Review);
exports.createReview = factory.createOne(Review);
exports.updateReview = factory.updateOne(Review);
exports.deleteReview = factory.deleteOne(Review);
