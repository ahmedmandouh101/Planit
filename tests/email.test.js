const { test } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const Email = require('../utils/email');

test('local SMTP does not send empty authentication credentials', (context) => {
  const original = { ...process.env };
  context.after(() => {
    process.env = original;
  });
  process.env.NODE_ENV = 'development';
  process.env.EMAIL_HOST = '127.0.0.1';
  process.env.EMAIL_PORT = '1025';
  process.env.EMAIL_USERNAME = '';
  process.env.EMAIL_PASSWORD = '';
  process.env.EMAIL_SECURE = 'false';
  context.mock.method(nodemailer, 'createTransport', (options) => {
    assert.equal(options.host, '127.0.0.1');
    assert.equal(options.port, 1025);
    assert.equal(options.secure, false);
    assert.equal(options.auth, undefined);
  });
  new Email(
    { email: 'test@example.com', name: 'Test User' },
    '',
  ).newTransport();
});

test('welcome email uses Planit branding without injecting the user name into HTML', async (context) => {
  context.mock.method(Email.prototype, 'send', async (subject, html) => {
    assert.equal(subject, 'Welcome to Planit!');
    assert.equal(html.includes('<img'), false);
    assert.equal(html.includes('TourMe'), false);
  });
  await new Email(
    { email: 'test@example.com', name: '<img src=x>' },
    '',
  ).sendWelcome();
});

test('production SMTP configuration is used instead of implicit SendGrid and requires TLS', (context) => {
  const original = { ...process.env };
  context.after(() => {
    process.env = original;
  });
  process.env.NODE_ENV = 'production';
  process.env.EMAIL_HOST = 'smtp.example.com';
  process.env.EMAIL_PORT = '587';
  process.env.EMAIL_SECURE = 'false';
  context.mock.method(nodemailer, 'createTransport', (options) => {
    assert.equal(options.host, 'smtp.example.com');
    assert.equal(options.service, undefined);
    assert.equal(options.requireTLS, true);
    assert.equal(options.port, 587);
  });
  new Email(
    { email: 'test@example.com', name: 'Test User' },
    '',
  ).newTransport();
});
