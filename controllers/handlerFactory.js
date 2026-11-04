const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const APIFeatures = require('../utils/apiFeatures');
const writeFields = require('../utils/writeFields');

exports.deleteOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndDelete(req.params.id);

    if (!doc) {
      return next(new AppError('No document found with that ID', 404));
    }

    res.status(204).json({
      status: 'success',
      data: null,
    });
  });

exports.updateOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndUpdate(
      req.params.id,
      writeFields(Model.modelName, req.body),
      {
        new: true,
        runValidators: true,
      },
    );

    if (!doc) {
      return next(new AppError('No document found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

exports.createOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.create(writeFields(Model.modelName, req.body));

    res.status(201).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

exports.getOne = (Model, popOptions, fixedFilter = {}) =>
  catchAsync(async (req, res, next) => {
    const filter = {
      ...fixedFilter,
      ...(req.params.tourId ? { tour: req.params.tourId } : {}),
    };
    let query = Object.keys(filter).length
      ? Model.findOne({ _id: req.params.id, ...filter })
      : Model.findById(req.params.id);
    if (popOptions) query = query.populate(popOptions);
    const doc = await query;

    if (!doc) {
      return next(new AppError('No document found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

exports.getAll = (Model, fixedFilter = {}, searchFields = []) =>
  catchAsync(async (req, res, next) => {
    // To allow for nested GET reviews on tour (hack)
    let filter = { ...fixedFilter };
    if (req.params.tourId) filter = { ...filter, tour: req.params.tourId };

    const parameters = { ...req.query };
    if (searchFields.length && parameters.q !== undefined) {
      const term = parameters.q;
      if (typeof term !== 'string' || !term.trim() || term.length > 100)
        throw new AppError('Provide a search query between 1 and 100 characters.', 400);
      const pattern = new RegExp(term.trim().replace(/[.*+?^$(){}|[\]\\]/g, '\\$&'), 'i');
      filter.$or = searchFields.map((field) => ({ [field]: pattern }));
      delete parameters.q;
    }
    const features = new APIFeatures(Model.find(), parameters, Model.schema)
      .filter()
      .sort()
      .limitFields()
      .paginate();
    // const doc = await features.query.explain();
    const doc = await features.query.find(filter);

    // SEND RESPONSE
    res.status(200).json({
      status: 'success',
      results: doc.length,
      data: {
        data: doc,
      },
    });
  });
