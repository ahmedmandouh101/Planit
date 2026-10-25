const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();
dotenv.config({ path: './config.env' });

process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});

if (!(process.env.DATABASE_LOCAL || process.env.DATABASE)) {
  throw new Error('Set DATABASE_LOCAL or DATABASE in the environment');
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('Set JWT_SECRET to a random secret of at least 32 characters');
}
process.env.JWT_SECRET_EXPIRES_IN ||= '7d';
process.env.JWT_COOKIE_EXPIRES_IN ||= '7';
const app = require('./app');
const inventory = require('./utils/seatInventory');
const payments = require('./utils/payments');
let server;
let stopExpiryWorker;
let stopPaymentWorker;

// const DB = process.env.DATABASE.replace(
//   '<PASSWORD>',
//   process.env.DATABASE_PASSWORD,
// );

mongoose
  .connect(process.env.DATABASE_LOCAL || process.env.DATABASE, {
    // .connect(DB, { //if you wanna connect on the local database
  })
  .then(async () => {
    await mongoose.model('Booking').init();
    await mongoose.model('Departure').init();
    await mongoose.model('PaymentAttempt').init();
    const topology = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!topology.setName && topology.msg !== 'isdbgrid') throw new Error('MongoDB transactions require a replica set. Run npm run db:local and use port 27018.');
    await inventory.expireAllHolds();
    stopExpiryWorker = inventory.startExpiryWorker();
    stopPaymentWorker = payments.startWorker();
    console.log('Database connection successful!');
    const port = process.env.PORT || 3000;
    server = app.listen(port, () => console.log(`App running on port ${port}...`));
  });

// console.log(process.env); // js has two environments development and production
// const port = 3000;

process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  if (server) server.close(() => process.exit(1));
  else process.exit(1);
});

const shutdown = () => {
  if (stopExpiryWorker) stopExpiryWorker();
  if (stopPaymentWorker) stopPaymentWorker();
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  if (server) server.close(() => mongoose.disconnect().then(() => process.exit(0)));
  else mongoose.disconnect().then(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
