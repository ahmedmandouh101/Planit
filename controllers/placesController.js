const Place = require('../model/placeModel');
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');

exports.getAllPlaces = factory.getAll(Place);
exports.getPlace = factory.getOne(Place);
exports.addPlace = factory.createOne(Place);
exports.UdatePlace = factory.updateOne(Place);
exports.deletePlace = factory.deleteOne(Place);

exports.getPlacesByTown = catchAsync(async (req, res) => {
  const { town } = req.params;
  const places = await Place.find({ town: town });
  res.status(200).json({
    status: 'success',
    data: {
      places,
    },
  });
});

exports.getPlacesByTownAndType = catchAsync(async (req, res) => {
  const { town, type } = req.params;
  const places = await Place.find({ town: town, type: type });
  res.status(200).json({
    status: 'success',
    data: {
      places,
    },
  });
});

