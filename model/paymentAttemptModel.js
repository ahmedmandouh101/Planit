const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.ObjectId, ref: 'Booking', required: true },
    user: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'usd' },
    tourName: { type: String, required: true },
    origin: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    status: {
      type: String,
      enum: [
        'creating',
        'open',
        'paid',
        'expired',
        'refund_pending',
        'refunded',
      ],
      default: 'creating',
    },
    active: { type: Boolean, default: true },
    stripeSessionId: String,
    checkoutUrl: String,
    paymentIntentId: String,
    refundId: String,
  },
  { timestamps: true },
);
schema.index(
  { booking: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
schema.index(
  { stripeSessionId: 1 },
  {
    unique: true,
    partialFilterExpression: { stripeSessionId: { $type: 'string' } },
  },
);
schema.index(
  { paymentIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: { paymentIntentId: { $type: 'string' } },
  },
);
schema.index({ active: 1, status: 1, updatedAt: 1 });
module.exports = mongoose.model('PaymentAttempt', schema);
