const express = require('express');
const rateLimit = require('express-rate-limit');
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

const recoveryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { status: 'fail', message: 'Too many password recovery attempts. Please try again in 15 minutes.' } });
router.post('/forgetPassword', recoveryLimiter, authController.forgetPassword);
router.patch('/resetPassword/:token', recoveryLimiter, authController.resetPassword);

// protect this routes after this middleware because they must be login
router.use(authController.protect);
router.get('/saved-tours', userController.getSavedTours);
router.put('/saved-tours/:tourId', userController.saveTour);
router.delete('/saved-tours/:tourId', userController.removeSavedTour);

router.patch('/updateMyPassword', authController.updatePassword);
router.get('/me', userController.getMe, userController.getUser);
router.patch(
  '/updateMe',
  userController.uploadUserPhoto,
  userController.resizeUserPhoto,
  userController.updateMe,
);
router.delete('/deleteMe', userController.deleteMe);

// restrict this middleware to only  admin to do this actions
router.use(authController.restrictTo('admin'));

router
  .route('/')
  .get(userController.getAllUser)
  .post(userController.createUser); //chaining the route handlers with the same url
router
  .route('/:id')
  .get(userController.getUser)
  .patch(userController.updateUser)
  .delete(userController.deleteUser);

module.exports = router;
