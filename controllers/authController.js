const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../model/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const Email = require('../utils/email');
const validator = require('validator');
const passwordInput = require('../utils/passwordInput');

const signToken = (user) =>
  jwt.sign(
    { id: user._id, passwordVersion: user.passwordVersion || 0 },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_SECRET_EXPIRES_IN,
    },
  );

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user);
  const cookiesOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000,
    ),
    httpOnly: true,
    sameSite: 'strict',
  };
  if (process.env.NODE_ENV === 'production') cookiesOptions.secure = true;
  res.cookie('jwt', token, cookiesOptions);

  // remove the password from the output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  passwordInput(req.body);
  if (
    typeof req.body.name !== 'string' ||
    !req.body.name.trim() ||
    req.body.name.length > 100 ||
    typeof req.body.email !== 'string' ||
    req.body.email.length > 254 ||
    !validator.isEmail(req.body.email.trim())
  )
    return next(
      new AppError(
        'Provide a name up to 100 characters and a valid email address.',
        400,
      ),
    );
  const newUser = await User.create({
    name: req.body.name.trim(),
    email: req.body.email.trim().toLowerCase(),
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
  });

  const url = `${req.protocol}://${req.get('host')}/api/v1/users/me`;
  try {
    await new Email(newUser, url).sendWelcome();
  } catch {
    console.warn('Welcome email delivery failed after account creation.');
  }

  createSendToken(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exist
  if (
    typeof email !== 'string' ||
    !email.trim() ||
    email.length > 254 ||
    typeof password !== 'string' ||
    !password ||
    password.length > 128
  ) {
    return next(new AppError('Please provide email and password!', 400));
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select(
    '+password',
  );

  // 2) Check if user exists && password is correct
  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  // 3) If everything ok, send token to client
  createSendToken(user, 200, res);
});

exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  res.status(200).json({ status: 'success' });
};

exports.protect = catchAsync(async (req, res, next) => {
  // getting the token and checking if it's there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    const cookie = (req.headers.cookie || '')
      .split(';')
      .find((part) => part.trim().startsWith('jwt='));
    if (cookie) token = cookie.trim().slice(4);
    if (token === 'loggedout') token = undefined;
  }

  if (!token) {
    return next(new AppError('No token provided', 401));
  }

  // verifying the token

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError(
        'The user belonging to this token does no longer exist.',
        401,
      ),
    );
  }

  // 4) Check if user changed password after the token was issued
  if (
    currentUser.changedPasswordAfter(decoded.iat) ||
    (currentUser.passwordVersion || 0) !== (decoded.passwordVersion || 0)
  ) {
    return next(
      new AppError('User recently changed password! Please log in again.', 401),
    );
  }

  // GRANT ACCESS TO PROTECTED ROUTE
  req.user = currentUser;
  next();
});

// wrapper function (rest parameter)
// eslint-disable-next-line arrow-body-style
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    // roles ['admin', 'lead-guide']. role='user'
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403),
      );
    }

    next();
  };
};

exports.forgetPassword = catchAsync(async (req, res, next) => {
  if (
    typeof req.body.email !== 'string' ||
    !validator.isEmail(req.body.email.trim())
  ) {
    return next(new AppError('Please provide a valid email address.', 400));
  }
  const response = {
    status: 'success',
    message:
      'If an account exists for this email, a reset link will arrive shortly. The link expires in 10 minutes.',
  };
  // 1) Get user based on POSTed email
  const user = await User.findOne({
    email: req.body.email.trim().toLowerCase(),
  });
  if (!user) {
    return res.status(200).json(response);
  }

  const appUrl = new URL(
    process.env.PUBLIC_APP_URL ||
      `http://localhost:${process.env.PORT || 3000}`,
  );
  if (
    !['http:', 'https:'].includes(appUrl.protocol) ||
    appUrl.username ||
    appUrl.password ||
    (process.env.NODE_ENV === 'production' &&
      (!process.env.PUBLIC_APP_URL || appUrl.protocol !== 'https:'))
  ) {
    return next(
      new AppError(
        'Password recovery is not configured. Please contact support.',
        503,
      ),
    );
  }

  // 2) Generate the random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // 3) Send it to user's email
  try {
    const resetURL = `${appUrl.origin}/#reset-password=${resetToken}`;

    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json(response);
  } catch (err) {
    await User.updateOne(
      {
        _id: user.id,
        passwordResetToken: crypto
          .createHash('sha256')
          .update(resetToken)
          .digest('hex'),
      },
      { $unset: { passwordResetToken: 1, passwordResetExpires: 1 } },
    );

    return next(
      new AppError(
        'There was an error sending the email. Try again later!',
        500,
      ),
    );
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  if (!/^[a-f0-9]{64}$/.test(req.params.token)) {
    return next(
      new AppError('Password reset token is invalid or has expired.', 400),
    );
  }
  passwordInput(req.body);
  const hashedToken = crypto // we hashed the   resetToken which was  sent via email
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  // 1) Get user using token
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+passwordResetToken +passwordResetExpires');

  // 2) check if user is already here and the token is valid and not expired
  if (!user) {
    return next(
      new AppError('Password reset token is invalid or has expired.', 400),
    );
  }

  user.password = req.body.password;
  user.confirmPassword = req.body.confirmPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.$where = {
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  };
  try {
    await user.save();
  } catch (error) {
    if (error.name === 'DocumentNotFoundError')
      return next(
        new AppError('Password reset token is invalid or has expired.', 400),
      );
    throw error;
  }

  createSendToken(user, 200, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  passwordInput(req.body);
  if (
    typeof req.body.currentPassword !== 'string' ||
    !req.body.currentPassword ||
    req.body.currentPassword.length > 128
  )
    return next(new AppError('Provide your current password as text.', 400));
  // 1) Get user from collection
  const user = await User.findById(req.user.id).select('+password');

  // 2) check if POSTed current password is correct
  if (!(await user.correctPassword(req.body.currentPassword, user.password))) {
    return next(
      new AppError(
        'Your current password is incorrect. Please try again.',
        401,
      ),
    );
  }

  // 3) If so, update password

  user.password = req.body.password;
  user.confirmPassword = req.body.confirmPassword;
  await user.save(); // not update to run the validation process

  // 4) Log user in, send JWT
  createSendToken(user, 200, res);
});
