const express = require('express');
const controller = require('../controllers/departureController');
const auth = require('../controllers/authController');

const router = express.Router();
router.get('/', controller.list);
router.put('/', auth.protect, auth.restrictTo('admin'), controller.configure);
module.exports = router;
