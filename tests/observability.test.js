const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const requestContext = require('../utils/requestContext');
const errorHandler = require('../controllers/errorController');

test('real HTTP responses include a fresh server request ID', async () => {
  const app = require('../app');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const identifiers = [];
    for (const route of ['/health/live', '/missing', '/']) {
      const response = await fetch(`${baseUrl}${route}`, {
        headers: { 'X-Request-ID': 'untrusted-client-value' },
        signal: AbortSignal.timeout(5000),
      });
      const identifier = response.headers.get('x-request-id');
      assert.match(identifier, /^[0-9a-f-]{36}$/);
      identifiers.push(identifier);
      await response.text();
    }
    assert.equal(new Set(identifiers).size, identifiers.length);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('disconnected requests are recorded once as aborted without a concrete URL', (context) => {
  const originalEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  context.after(() => {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
  });
  const logs = [];
  context.mock.method(console, 'log', (entry) => logs.push(JSON.parse(entry)));
  const response = new EventEmitter();
  response.statusCode = 200;
  response.writableFinished = false;
  response.setHeader = () => {};
  requestContext({ method: 'GET', originalUrl: '/secret-path' }, response, () => {});
  response.emit('close');
  response.emit('close');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].aborted, true);
  assert.equal(logs[0].route, 'unmatched');
  assert.doesNotMatch(JSON.stringify(logs), /secret-path/);
});

test('request logs use generated IDs and route templates without sensitive input', (context) => {
  const originalEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  context.after(() => {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
  });
  const logs = [];
  context.mock.method(console, 'log', (entry) => logs.push(JSON.parse(entry)));
  const request = {
    method: 'POST', baseUrl: '/api/v1/users', route: { path: '/resetPassword/:token' },
    originalUrl: '/api/v1/users/resetPassword/secret-token?key=secret-key',
    headers: { authorization: 'Bearer secret-auth', 'x-request-id': 'forged-id' },
    body: { password: 'secret-password' },
  };
  const response = new EventEmitter();
  response.statusCode = 200;
  response.writableFinished = true;
  response.setHeader = (name, value) => {
    assert.equal(name, 'X-Request-ID');
    assert.equal(value, request.requestId);
  };
  let called = false;
  requestContext(request, response, () => { called = true; });
  response.emit('finish');
  response.emit('close');
  assert.equal(called, true);
  assert.match(request.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].route, '/api/v1/users/resetPassword/:token');
  assert.equal(logs[0].aborted, false);
  assert.ok(logs[0].durationMs >= 0);
  assert.doesNotMatch(JSON.stringify(logs), /secret-|forged-id/);
});

test('unexpected production errors correlate with safe logs without exposing error details', (context) => {
  const originalEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  context.after(() => {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
  });
  const logs = [];
  context.mock.method(console, 'error', (entry) => logs.push(JSON.parse(entry)));
  let payload;
  const response = {
    status(code) { assert.equal(code, 500); return this; },
    json(body) { payload = body; },
  };
  errorHandler(new Error('mongodb://user:secret@host/database'), { requestId: 'test-request' }, response, () => {});
  assert.equal(payload.requestId, 'test-request');
  assert.equal(logs[0].requestId, 'test-request');
  assert.doesNotMatch(JSON.stringify({ logs, payload }), /mongodb|secret|stack/);
});
