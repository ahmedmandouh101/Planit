/* eslint-disable import/no-extraneous-dependencies */
const { randomUUID } = require('node:crypto');
const { writeFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const imageUpload = require('../utils/imageUpload');
const User = require('../model/userModel');
const mongoose = require('mongoose');
const Tour = require('../model/tourModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const factory = require('./handlerFactory');

// const storageMulter = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'public/img/users');
//   },
//   filename: (req, file, cb) => {
//     // user-134589abc834-33313455.jpeg
//     const ext = file.mimetype.split('/')[1];
//     cb(null, `user-${req.user.id}-${Date.now()}.${ext}`);
//   },
// });

exports.uploadUserPhoto = imageUpload.upload.single('photo');

exports.resizeUserPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  const buffer = await imageUpload.jpeg(req.file.buffer, 500, 500);
  req.file.filename = `user-${randomUUID()}.jpeg`;
  const directory = path.join(__dirname, '../public/img/users');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, req.file.filename), buffer);

  next();
});

const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

exports.getMe = (req, res, next) => {
  req.params.id = req.user.id;
  next();
};

exports.getSavedTours = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id)
    .select('+savedTours')
    .populate('savedTours');
  res.status(200).json({ status: 'success', data: { tours: user.savedTours } });
});

exports.saveTour = catchAsync(async (req, res, next) => {
  if (!mongoose.isObjectIdOrHexString(req.params.tourId))
    return next(new AppError('Invalid tour ID', 400));
  const tour = await Tour.findById(req.params.tourId);
  if (!tour) return next(new AppError('Tour not found', 404));
  await User.findByIdAndUpdate(req.user.id, {
    $addToSet: { savedTours: tour.id },
  });
  res.status(200).json({ status: 'success' });
});

exports.removeSavedTour = catchAsync(async (req, res, next) => {
  if (!mongoose.isObjectIdOrHexString(req.params.tourId))
    return next(new AppError('Invalid tour ID', 400));
  await User.findByIdAndUpdate(req.user.id, {
    $pull: { savedTours: req.params.tourId },
  });
  res.status(200).json({ status: 'success' });
});

exports.updateMe = catchAsync(async (req, res, next) => {
  // 1) Create error if user POSTs password data
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'This route is not for password updates. Please use /updateMyPassword.',
        400,
      ),
    );
  }

  // 2) Filtered out unwanted fields names that are not allowed to be updated
  const filteredBody = filterObj(req.body, 'name', 'email');
  if (req.file) filteredBody.photo = req.file.filename;

  // 3) Update user document
  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser,
    },
  });
});

exports.deleteMe = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user.id, { active: false });

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.createUser = (req, res) => {
  res.status(500).json({
    status: 'failed',
    message: 'This route NOT implemented pls go to /signup',
  });
};

exports.getAllUser = factory.getAll(User);
exports.getUser = factory.getOne(User);
exports.updateUser = (req, res, next) => {
  req.body = filterObj(req.body, 'name', 'email', 'photo', 'role');
  return factory.updateOne(User)(req, res, next);
};
exports.deleteUser = factory.deleteOne(User);
