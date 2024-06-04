const path = require('path');
const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

const AppError = require('./utils/AppError');
const globalErrorHandler = require('./controllers/errorController');
const tourRouter = require('./routes/tourRouter');
const userRouter = require('./routes/userRouter');
const placesRouter = require('./routes/placesRouter');
const reviewRouter = require('./routes/reviewRouter');
const bookingRouter = require('./routes/bookingRouter');
const searchRouter = require('./routes/searchRouter');
const driverRouter = require('./routes/driverRouter');


const app = express();
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Global middleware to handle the request to the server

// show the static files in public folder like html or css or img files
// app.use(express.static('./public'));
app.use(express.static(path.join(__dirname, 'public')));

// Set security http headers
app.use(helmet());

// it's a logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Limiting requests from the same API to prevent denial of service and brute force attacks
const limiter = rateLimit({
  max: 100, // limit each IP to 100 requests per windowMs
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many requests from this IP, please try again in an hour',
});
app.use('/api', limiter);

// body parser , reading data from body to req.body
app.use(express.json({ limit: '10kb' }));

// Data santization against NoSQL query injection
app.use(mongoSanitize());

// Data santization against XSS (prevent to insert some malicious html or js code) the mongoose schema is good for it also
app.use(xss());

// Prevent Parameter Pollution
app.use(
  hpp({
    whitelist: [
      'duration',
      'difficulty',
      'price',
      'ratingsQuantity',
      'ratingsAverage',
    ],
  }),
);

// for testing middleware
app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  // console.log(req.cookies);
  next();
});

app.get('/', (req, res) => {
  res.status(200).render('base');
});

app.use('/api/v1/tours', tourRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/places', placesRouter);
app.use('/api/v1/reviews', reviewRouter);
app.use('/api/v1/bookings', bookingRouter);
app.use('/api/v1/search', searchRouter);
app.use('/api/v1/drivers', driverRouter);

// To handle invalid URL errors  (WildCard)
app.all('*', (req, res, next) => {
  next(new AppError(` Cannot find ${req.originalUrl} pn this server!`), 404);
});

app.use(globalErrorHandler);

module.exports = app;
