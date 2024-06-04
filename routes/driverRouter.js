const express = require('express');
const driverController = require('../controllers/driverController');
const authController = require('../controllers/authController');

const router = express.Router();
router
  .route('/')
  .get(driverController.getAllDrivers)
  .post(
    driverController.addDriver,
  );
router
  .route('/:id')
  .get(driverController.getDriver)
  .delete(
    driverController.deleteDriver,
  );


module.exports = router;