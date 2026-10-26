const express = require('express');
const auth = require('../controllers/authController');
const Tour = require('../model/tourModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

const router = express.Router();
router.use(auth.protect, auth.restrictTo('admin'));
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.get(
  '/tours',
  catchAsync(async (req, res, next) => {
    const page = Number(req.query.page === undefined ? 1 : req.query.page);
    if (
      Object.keys(req.query).some((field) => field !== 'page') ||
      (req.query.page !== undefined && typeof req.query.page !== 'string') ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 10000
    )
      return next(new AppError('Use a page from 1 to 10000.', 400));
    const tours = await Tour.find()
      .select(
        'name summary description price duration MaxGroupSize difficulty imageCover secretTour startDates',
      )
      .sort({ _id: -1 })
      .skip((page - 1) * 25)
      .limit(26);
    res.json({
      status: 'success',
      hasMore: tours.length > 25,
      data: {
        tours: tours
          .slice(0, 25)
          .map((tour) =>
            Object.fromEntries(
              [
                '_id',
                'name',
                'summary',
                'description',
                'price',
                'duration',
                'MaxGroupSize',
                'difficulty',
                'imageCover',
                'secretTour',
                'startDates',
              ].map((field) => [field, tour[field]]),
            ),
          ),
      },
    });
  }),
);
module.exports = router;
