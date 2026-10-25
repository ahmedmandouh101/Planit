const Stripe = require('stripe');
const AppError = require('./AppError');

let client;
let clientKey;
function isConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') &&
      process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_') &&
      process.env.PUBLIC_APP_URL,
  );
}
function getClient() {
  if (!isConfigured())
    throw new AppError(
      'Stripe test checkout is not configured yet. Please try again later.',
      503,
    );
  if (!client || clientKey !== process.env.STRIPE_SECRET_KEY) {
    clientKey = process.env.STRIPE_SECRET_KEY;
    client = new Stripe(clientKey, {
      apiVersion: '2024-04-10',
      timeout: 10000,
      maxNetworkRetries: 2,
    });
  }
  return client;
}
module.exports = { isConfigured, getClient };
