const express = require('express');
const bookingController = require('../controllers/bookingController');
const authController = require('../controllers/authController');
const myBookingController = require('../controllers/myBookingController');

const router = express.Router();

router.use(authController.protect);

router.get('/mine', myBookingController.list);
router.post('/', myBookingController.create);
router.patch('/:id/cancel', myBookingController.cancel);

router.use(authController.restrictTo('admin'));

router
  .route('/')
  .get(bookingController.getAllBooking);

router
  .route('/:id')
  .get(bookingController.getBooking)
  .patch(bookingController.updateBooking)
  .delete(bookingController.deleteBooking);

module.exports = router;
