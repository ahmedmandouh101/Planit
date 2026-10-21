const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const configuration = template.replace(/^JWT_SECRET=$/m, `JWT_SECRET=${crypto.randomBytes(48).toString('hex')}`);

if (fs.existsSync(path.join(root, 'config.env'))) {
  console.log('Existing config.env detected; no .env was generated.');
} else {
  try {
    fs.writeFileSync(path.join(root, '.env'), configuration, { flag: 'wx' });
    console.log('Created .env with a generated JWT secret. Configure your database and SMTP locally.');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log('Existing .env preserved.');
  }
}

for (const directory of ['users', 'tours']) {
  fs.mkdirSync(path.join(root, 'public', 'img', directory), { recursive: true });
}
console.log('Local upload directories are ready.');
