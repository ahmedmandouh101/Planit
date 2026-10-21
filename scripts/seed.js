const path = require('node:path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Tour = require('../model/tourModel');
const Place = require('../model/placeModel');
const { tours, places } = require('../data/demo');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', 'config.env') });

async function seed() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Demo seeding requires NODE_ENV=development');
  }
  const database = process.env.DATABASE_LOCAL || process.env.DATABASE;
  if (!database) throw new Error('Configure DATABASE_LOCAL or DATABASE');
  await mongoose.connect(database, { serverSelectionTimeoutMS: 5000 });
  for (const [Model, records] of [[Tour, tours], [Place, places]]) {
    for (const record of records) {
      const existing = await Model.exists({ name: record.name });
      if (!existing) await Model.create(record);
    }
  }
  console.log('Demo tours and places are ready. Existing records were preserved.');
}

seed().catch(() => {
  console.error('Demo seed failed. Check database connectivity and NODE_ENV=development.');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
