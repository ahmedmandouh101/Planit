const mongoose = require('mongoose');
const payments = require('../utils/payments');
const stripeClient = require('../utils/stripeClient');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

exports.status = (req, res) =>
  res
    .set('Cache-Control', 'no-store')
    .status(200)
    .json({
      status: 'success',
      data: { enabled: stripeClient.isConfigured(), mode: 'test' },
    });

exports.checkout = catchAsync(async (req, res, next) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id))
    return next(new AppError('Invalid booking ID.', 400));
  try {
    res
      .set('Cache-Control', 'no-store')
      .status(200)
      .json({
        status: 'success',
        data: await payments.checkout(req.params.id, req.user.id),
      });
  } catch (error) {
    if (error.isOperational) return next(error);
    return next(
      new AppError(
        'Stripe test checkout is temporarily unavailable. Retry the same booking or cancel checkout; its seats remain protected.',
        503,
      ),
    );
  }
});

exports.cancel = catchAsync(async (req, res, next) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id))
    return next(new AppError('Invalid booking ID.', 400));
  try {
    await payments.cancelCheckout(req.params.id, req.user.id);
    res.status(200).json({ status: 'success' });
  } catch (error) {
    if (error.isOperational) return next(error);
    return next(
      new AppError(
        'Checkout could not be verified with Stripe. Seats remain protected; please retry.',
        503,
      ),
    );
  }
});

exports.webhook = async (req, res) => {
  let event;
  if (!stripeClient.isConfigured())
    return res
      .status(503)
      .json({
        status: 'error',
        message: 'Stripe test webhooks are not configured.',
      });
  try {
    if (!Buffer.isBuffer(req.body)) throw new Error('Raw body required');
    event = stripeClient
      .getClient()
      .webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET,
      );
  } catch {
    return res
      .status(400)
      .json({ status: 'fail', message: 'Invalid Stripe webhook signature.' });
  }
  try {
    await payments.handleEvent(event);
    return res.status(200).json({ received: true });
  } catch (error) {
    return res
      .status(error.isOperational && error.statusCode === 400 ? 400 : 503)
      .json({
        status: 'error',
        message: 'The payment event could not be applied. Retry delivery.',
      });
  }
};
