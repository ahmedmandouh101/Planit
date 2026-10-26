const AppError = require('./AppError');

module.exports = (body) => {
  if (
    typeof body.password !== 'string' ||
    body.password.length < 8 ||
    Buffer.byteLength(body.password, 'utf8') > 72
  )
    throw new AppError(
      'Use a password of at least 8 characters and at most 72 UTF-8 bytes.',
      400,
    );
  if (body.password !== body.confirmPassword)
    throw new AppError('Passwords do not match.', 400);
};
