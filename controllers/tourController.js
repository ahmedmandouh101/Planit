/* eslint-disable import/no-extraneous-dependencies */
const { randomUUID } = require('node:crypto');
const { writeFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const imageUpload = require('../utils/imageUpload');
const Tour = require('../model/tourModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const factory = require('./handlerFactory');
// const AppError = require('../utils/AppError');
// const APIFeature = require('../utils/apiFeatures');

exports.uploadTourImages = imageUpload.upload.fields([
  { name: 'imageCover', maxCount: 1 },
  { name: 'images', maxCount: 3 },
]);

// upload.single('image') req.file
// upload.array('images', 5) req.files

exports.resizeTourImages = catchAsync(async (req, res, next) => {
  if (!req.files || !Object.keys(req.files).length) return next();
  const files = [...(req.files.imageCover || []), ...(req.files.images || [])];
  const converted = await Promise.all(
    files.map(async (file) => ({
      field: file.fieldname,
      filename: `tour-${randomUUID()}.jpeg`,
      buffer: await imageUpload.jpeg(file.buffer, 2000, 1333),
    })),
  );
  const directory = path.join(__dirname, '../public/img/tours');
  await mkdir(directory, { recursive: true });
  await Promise.all(
    converted.map((file) =>
      writeFile(path.join(directory, file.filename), file.buffer),
    ),
  );
  const cover = converted.find((file) => file.field === 'imageCover');
  if (cover) req.body.imageCover = cover.filename;
  if (req.files.images)
    req.body.images = converted
      .filter((file) => file.field === 'images')
      .map((file) => file.filename);
  next();
});

exports.alias = (req, res, next) => {
  req.query.limit = '5';
  req.query.sort = '-ratingsAverage,price';
  next();
};

exports.getAllTour = factory.getAll(Tour, { secretTour: { $ne: true } });
exports.getTour = factory.getOne(Tour, { path: 'reviews' }, { secretTour: { $ne: true } });
exports.createTour = factory.createOne(Tour);
exports.updateTour = factory.updateOne(Tour);
exports.deleteTour = factory.deleteOne(Tour);

//make aggregation pipeline to do some calculations and statistics on the tour data by perform some stages
exports.getTourStats = catchAsync(async (req, res, next) => {
  const stats = await Tour.aggregate([
    {
      $match: { ratingsAverage: { $gte: 4.5 }, secretTour: { $ne: true } },
    },
    {
      $group: {
        _id: { $toUpper: '$difficulty' },
        numTours: { $sum: 1 },
        numRatings: { $sum: '$ratingsQuantity' },
        avgRating: { $avg: '$ratingsAverage' },
        avgPrice: { $avg: '$price' },
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' },
      },
    },
    {
      $sort: { avgPrice: 1 },
    },
    // {
    //   $match: { _id: { $ne: 'EASY' } }
    // }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      stats,
    },
  });
});

exports.monthlyPlan = catchAsync(async (req, res, next) => {
  const year = +req.params.year;
  if (!/^\d{4}$/.test(req.params.year) || year < 2000 || year > 2100)
    return next(new AppError('Choose a year from 2000 to 2100.', 400));
  const plan = await Tour.aggregate([
    {
      $unwind: '$startDates', // to convert the array to a string
    },
    {
      $match: {
        startDates: {
          $gte: new Date(`${year}-01-01`),
          $lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
        },
      },
    },
    {
      $group: {
        _id: { $month: '$startDates' },
        numTourStarts: { $sum: 1 },
        tours: { $push: '$name' }, // to convert to array
      },
    },
    {
      $addFields: { month: '$_id' }, // to add fields
    },
    {
      $project: {
        // to disable the field
        _id: 0,
      },
    },
    {
      $sort: { numTourStarts: -1 },
    },
    {
      $limit: 12, // such as in mongoose
    },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      plan,
    },
  });
});
