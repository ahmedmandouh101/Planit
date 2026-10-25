const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { MongoClient } = require('mongoose').mongo;

const directory = path.join(__dirname, '..', '.local', 'mongodb-rs');
fs.mkdirSync(directory, { recursive: true });
const executable =
  process.env.MONGOD_BIN ||
  (process.platform === 'win32'
    ? 'C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe'
    : 'mongod');
const child = spawn(
  executable,
  [
    '--dbpath',
    directory,
    '--port',
    '27018',
    '--bind_ip',
    '127.0.0.1',
    '--replSet',
    'planit-rs',
    '--logpath',
    path.join(directory, 'mongod.log'),
    '--logappend',
  ],
  { stdio: 'inherit', windowsHide: true },
);
let stopping = false;
child.on('error', () => {
  console.error('MongoDB could not start. Install MongoDB or set MONGOD_BIN.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  stopping = true;
  process.exitCode = code || 0;
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
    child.kill(signal);
  });

async function initialize() {
  for (let attempt = 0; attempt < 30 && !stopping; attempt += 1) {
    const client = new MongoClient(
      'mongodb://127.0.0.1:27018/?directConnection=true',
      { serverSelectionTimeoutMS: 1000 },
    );
    try {
      await client.connect();
      try {
        await client
          .db('admin')
          .command({
            replSetInitiate: {
              _id: 'planit-rs',
              members: [{ _id: 0, host: '127.0.0.1:27018' }],
            },
          });
      } catch (error) {
        if (error.code !== 23) throw error;
      }
      const hello = await client.db('admin').command({ hello: 1 });
      if (hello.setName !== 'planit-rs')
        throw new Error('Unexpected replica set');
      if (hello.isWritablePrimary) {
        console.log('Planit MongoDB replica set ready at 127.0.0.1:27018');
        return;
      }
    } catch (error) {
      if (attempt === 29) {
        console.error(
          'MongoDB did not become ready. Check .local/mongodb-rs/mongod.log.',
        );
        child.kill();
        process.exitCode = 1;
      }
    } finally {
      await client.close();
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
initialize().catch(() => {
  child.kill();
  process.exitCode = 1;
});
