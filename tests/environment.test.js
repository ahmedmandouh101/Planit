const { test } = require('node:test');
const assert = require('node:assert/strict');
const validate = require('../utils/validateEnvironment');
const development = {
  JWT_SECRET: 'test-only-secret-'.repeat(3),
  DATABASE_LOCAL: 'mongodb://127.0.0.1:27018/test',
};
const production = {
  NODE_ENV: 'production',
  JWT_SECRET: development.JWT_SECRET,
  DATABASE: 'mongodb+srv://example.invalid/planit',
  PUBLIC_APP_URL: 'https://planit.example.com',
  EMAIL_HOST: 'smtp.example.com',
  EMAIL_FROM: 'hello@example.com',
  EMAIL_SECURE: 'true',
  EMAIL_PORT: '465',
};

test('environment validation supports local setup without requiring Stripe', () => {
  assert.equal(validate(development).database, development.DATABASE_LOCAL);
  assert.equal(validate(production).database, production.DATABASE);
});
test('production fails closed for accidental local databases and unsafe public origins', () => {
  assert.throws(() =>
    validate({ ...production, DATABASE_LOCAL: development.DATABASE_LOCAL }),
  );
  for (const origin of [
    undefined,
    'http://planit.example.com',
    'https://user:secret@example.com',
    'https://example.com/reset',
    'https://example.com/?secret=yes',
  ]) {
    assert.throws(() => validate({ ...production, PUBLIC_APP_URL: origin }));
  }
});
test('startup errors validate ports and email configuration without echoing secrets', () => {
  for (const overrides of [
    { PORT: '0' },
    { PORT: '1.5' },
    { EMAIL_PORT: 'invalid' },
    { EMAIL_HOST: '' },
    { EMAIL_SECURE: '' },
    { EMAIL_USERNAME: 'username', EMAIL_PASSWORD: '' },
    { JWT_SECRET: 'short-secret' },
  ]) {
    assert.throws(
      () => validate({ ...production, ...overrides }),
      (error) => !error.message.includes('short-secret'),
    );
  }
});
