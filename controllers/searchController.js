const Place = require('../model/placeModel');
exports.searchPlaces = async (req, res, next) => {
  try {
    const queryText = req.query.q;
    const results = await Place.find({
      $or: [
        { name: { $regex: new RegExp(queryText, 'i') } },
        { type: { $regex: new RegExp(queryText, 'i') } },
        { town: { $regex: new RegExp(queryText, 'i') } },
        { location: { $regex: new RegExp(queryText, 'i') } },
        { about: { $regex: new RegExp(queryText, 'i') } }
      ]
    }).sort({type: -1}); 
    res.status(200).json({
    status: 'success',
      data: {
        results,
      },
    });
  }
  catch{
      res.status(404).json({
      status: 'fail',
      message: error,
    });
  }
};