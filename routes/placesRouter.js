const express = require('express');
const placeController = require('../controllers/placesController');
const authController = require('../controllers/authController');

const router = express.Router();

router
  .route('/')
  .get(placeController.getAllPlaces)
  .post(
    authController.protect,
    authController.restrictTo('admin'),
    placeController.addPlace,
  );
router
  .route('/:id')
  .get(placeController.getPlace)
  .patch(
    authController.protect,
    authController.restrictTo('admin'),
    placeController.UdatePlace,
  )
  .delete(
    authController.protect,
    authController.restrictTo('admin'),
    placeController.deletePlace,
  );

router.route('/town/:town').get(placeController.getPlacesByTown);
router.route('/town/:town/:type').get(placeController.getPlacesByTownAndType);

module.exports = router;
