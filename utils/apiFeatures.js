const AppError = require('./AppError');

class APIFeature {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
  }

  filter() {
    // 1B) Advanced Filtering
    const queryObj = { ...this.queryString }; // Shallow copy
    const excludedFields = ['page', 'limit', 'sort', 'fields'];
    excludedFields.forEach((el) => delete queryObj[el]);

    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);

    this.query = this.query.find(JSON.parse(queryStr)); // find method return a query string and execute it in the database
    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort('-createdAt');
    }
    return this;
  }

  limitFields() {
    if (this.queryString.fields) {
      const field = this.queryString.fields.split(',').join(' ');
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
