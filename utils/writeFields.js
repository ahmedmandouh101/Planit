const AppError = require('./AppError');

const fields = {
  Tour: [
    'name',
    'duration',
    'MaxGroupSize',
    'difficulty',
    'price',
    'priceDiscount',
    'summary',
    'description',
    'imageCover',
    'images',
    'startDates',
    'secretTour',
    'startLocation',
    'locations',
    'guides',
  ],
  Place: [
    'name',
    'about',
    'location',
    'avgRate',
    'town',
    'type',
    'avgPrice',
    'imageCover',
  ],
  Driver: ['name', 'age', 'phone', 'car', 'location', 'rating', 'image'],
  Review: ['review', 'rating', 'tour', 'user', 'place'],
  User: ['name', 'email', 'photo', 'role'],
};

module.exports = (modelName, body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new AppError('Provide a JSON object.', 400);
  const allowed = fields[modelName];
  if (!allowed)
    throw new AppError(
      'Generic writes are not enabled for this resource.',
      409,
    );
  const result = {};
  for (const [name, value] of Object.entries(body)) {
    if (!allowed.includes(name))
      throw new AppError(
        `Field ${name} cannot be written on this endpoint.`,
        400,
      );
    result[name] = value;
  }
  if (!Object.keys(result).length)
    throw new AppError('Provide at least one writable field.', 400);
  return result;
};
