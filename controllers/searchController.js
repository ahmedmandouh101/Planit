const Place = require('../model/placeModel');
const AppError = require('../utils/AppError');
exports.searchPlaces = async (req, res, next) => {
  try {
    const queryText = req.query.q;
    if (typeof queryText !== 'string' || !queryText.trim() || queryText.length > 100) {
      return next(new AppError('Provide a search query between 1 and 100 characters', 400));
    }
    const pattern = queryText.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const results = await Place.find({
      $or: [
        { name: { $regex: new RegExp(pattern, 'i') } },
        { type: { $regex: new RegExp(pattern, 'i') } },
        { town: { $regex: new RegExp(pattern, 'i') } },
        { 'location.address': { $regex: new RegExp(pattern, 'i') } },
        { about: { $regex: new RegExp(pattern, 'i') } }
      ]
    }).sort({type: -1}).limit(100);
    res.status(200).json({
    status: 'success',
      data: {
        results,
      },
    });
  }
  catch (error) {
    next(error);
  }
};
