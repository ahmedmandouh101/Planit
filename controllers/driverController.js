const Driver  = require('../model/driverModel');
const factory = require('./handlerFactory');
exports.getAllDrivers = factory.getAll(Driver);
exports.addDriver = factory.createOne(Driver);
exports.getDriver = factory.getOne(Driver);
exports.deleteDriver = factory.deleteOne(Driver);
exports.updateDriver = factory.updateOne(Driver);