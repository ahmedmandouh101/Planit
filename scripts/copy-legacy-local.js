const { MongoClient } = require('mongoose').mongo;

async function copy() {
  const source = new MongoClient('mongodb://127.0.0.1:27017/planit', {
    serverSelectionTimeoutMS: 5000,
  });
  const target = new MongoClient(
    'mongodb://127.0.0.1:27018/planit?replicaSet=planit-rs',
    { serverSelectionTimeoutMS: 5000 },
  );
  try {
    await source.connect();
    await target.connect();
    const original = source.db('planit');
    const destination = target.db('planit');
    const collections = await destination.listCollections().toArray();
    if (collections.length)
      throw new Error(
        'Target database must be empty. No existing target collections were modified.',
      );
    for (const collection of await original
      .listCollections({ type: 'collection' })
      .toArray()) {
      if (collection.name.startsWith('system.')) continue;
      await destination.createCollection(collection.name);
      let batch = [];
      for await (const record of original.collection(collection.name).find()) {
        batch.push(record);
        if (batch.length === 100) {
          await destination.collection(collection.name).insertMany(batch);
          batch = [];
        }
      }
      if (batch.length)
        await destination.collection(collection.name).insertMany(batch);
      const indexes = (await original.collection(collection.name).indexes())
        .filter((index) => index.name !== '_id_')
        .map(({ v, ns, ...index }) => index);
      if (indexes.length)
        await destination.collection(collection.name).createIndexes(indexes);
    }
    console.log(
      'Copied development collections and indexes to port 27018. The original database was not modified.',
    );
  } finally {
    await source.close();
    await target.close();
  }
}
copy().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
