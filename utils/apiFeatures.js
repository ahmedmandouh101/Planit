const AppError = require('./AppError');

class APIFeature {
  constructor(query, queryString, schema) {
    this.query = query;
    this.queryString = queryString;
    this.schema = schema;
  }

  validateField(field) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(field) ||
      field === '__v'
    )
      throw new AppError('Invalid query field.', 400);
    if (this.schema) {
      const definition = this.schema.path(field);
      if (
        !definition ||
        definition.options.select === false ||
        [
          'password',
          'confirmPassword',
          'passwordVersion',
          'passwordChangedAt',
        ].includes(field)
      )
        throw new AppError('This field is not available for querying.', 400);
    }
  }

  fieldList(value, maximum) {
    if (typeof value !== 'string' || value.length > 500)
      throw new AppError('Provide a comma-separated field list.', 400);
    const fields = value.split(',');
    if (!fields.length || fields.length > maximum)
      throw new AppError('Too many query fields.', 400);
    for (const field of fields)
      this.validateField(field.startsWith('-') ? field.slice(1) : field);
    return fields;
  }

  filter() {
    const entries = Object.entries(this.queryString).filter(
      ([field]) => !['page', 'limit', 'sort', 'fields'].includes(field),
    );
    if (entries.length > 20) throw new AppError('Too many filters.', 400);
    const filters = {};
    for (const [field, value] of entries) {
      this.validateField(field);
      if (typeof value === 'string' && value.length <= 500)
        filters[field] = value;
      else if (value && typeof value === 'object' && !Array.isArray(value)) {
        const comparisons = Object.entries(value);
        if (!comparisons.length || comparisons.length > 4)
          throw new AppError('Invalid comparison filter.', 400);
        const converted = {};
        for (const [operator, operand] of comparisons) {
          if (
            !['gte', 'gt', 'lte', 'lt'].includes(operator) ||
            typeof operand !== 'string' ||
            operand.length > 100
          )
            throw new AppError(
              'Use scalar values with gt, gte, lt, or lte.',
              400,
            );
          converted[`$${operator}`] = operand;
        }
        filters[field] = converted;
      } else throw new AppError('Invalid filter value.', 400);
    }
    this.query = this.query.find(filters);
    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const sortBy = this.fieldList(this.queryString.sort, 10).join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort('-createdAt');
    }
    return this;
  }

  limitFields() {
    if (this.queryString.fields) {
      const fields = this.fieldList(this.queryString.fields, 20);
      const modes = new Set(
        fields
          .filter((field) => field !== '_id' && field !== '-_id')
          .map((field) => field.startsWith('-')),
      );
      if (modes.size > 1)
        throw new AppError('Do not mix included and excluded fields.', 400);
      const field = fields.join(' ');
      this.query = this.query.select(field);
    } else {
      this.query = this.query.select('-__v'); //exclude fields
    }
    return this;
  }

  paginate() {
    const page =
      this.queryString.page === undefined ? 1 : Number(this.queryString.page);
    const limit =
      this.queryString.limit === undefined
        ? 100
        : Number(this.queryString.limit);
    if (
      (this.queryString.page !== undefined &&
        typeof this.queryString.page !== 'string') ||
      (this.queryString.limit !== undefined &&
        typeof this.queryString.limit !== 'string') ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 10000 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new AppError(
        'Use page from 1 to 10000 and limit from 1 to 100.',
        400,
      );
    const skip = (page - 1) * limit;
    this.query = this.query.skip(skip).limit(limit);
    return this;
  }
}

module.exports = APIFeature;
