const express = require('express');
const bookingController = require('../controllers/bookingController');
const authController = require('../controllers/authController');
const myBookingController = require('../controllers/myBookingController');

const router = express.Router();

router.use(authController.protect);

router.get('/mine', myBookingController.list);
router.post('/', myBookingController.create);
router.patch('/:id/cancel', myBookingController.cancel);
router.post('/:id/hold', myBookingController.hold);
router.delete('/:id/hold', myBookingController.release);
router.post('/:id/checkout', require('../controllers/paymentController').checkout);
router.post('/:id/checkout/cancel', require('../controllers/paymentController').cancel);

router.use(authController.restrictTo('admin'));
router.use('/:id', bookingController.protectInventory);

router
  .route('/')
  .get(bookingController.getAllBooking);

router
  .route('/:id')
  .get(bookingController.getBooking);

module.exports = router;
