const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');
const specification = require('../docs/openapi');

let server;
let baseUrl;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('OpenAPI references, operation IDs, responses, and path parameters are consistent', () => {
  assert.equal(specification.openapi, '3.0.3');
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      assert.ok(value.$ref.startsWith('#/'));
      const resolved = value.$ref
        .slice(2)
        .split('/')
        .reduce((node, key) => node?.[key], specification);
      assert.ok(resolved, `Unresolved reference ${value.$ref}`);
    }
    Object.values(value).forEach(walk);
  };
  walk(specification);
  const identifiers = new Set();
  for (const [path, methods] of Object.entries(specification.paths)) {
    for (const definition of Object.values(methods)) {
      assert.ok(definition.operationId);
      assert.equal(identifiers.has(definition.operationId), false);
      identifiers.add(definition.operationId);
      assert.ok(
        Object.keys(definition.responses).some((code) => /^2\d\d$/.test(code)),
      );
      for (const match of path.matchAll(/\{([^}]+)\}/g)) {
        assert.ok(
          definition.parameters?.some(
            (entry) =>
              entry.name === match[1] && entry.in === 'path' && entry.required,
          ),
        );
      }
      for (const requirement of definition.security) {
        for (const scheme of Object.keys(requirement))
          assert.ok(specification.components.securitySchemes[scheme]);
      }
    }
  }
});

test('published documentation is readable, same-origin, and has no executable third-party assets', async () => {
  const document = await fetch(`${baseUrl}/docs/openapi.json`);
  assert.equal(document.status, 200);
  assert.match(document.headers.get('content-type'), /application\/json/);
  assert.deepEqual(
    await document.json(),
    JSON.parse(JSON.stringify(specification)),
  );
  const page = await fetch(`${baseUrl}/api-docs`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /Download OpenAPI 3.0 JSON/);
  assert.match(html, /real hosted sandbox verification is pending/i);
  assert.doesNotMatch(html, /<script|https?:\/\//i);
  assert.match(
    page.headers.get('content-security-policy'),
    /default-src 'self'/,
  );
  const stylesheet = await fetch(`${baseUrl}/api-docs.css`);
  assert.equal(stylesheet.status, 200);
});

test('core security and idempotency contracts are documented without enabling checkout', async () => {
  const paths = specification.paths;
  assert.deepEqual(paths['/api/v1/bookings'].post.security, [
    { bearerAuth: [] },
    { cookieAuth: [] },
  ]);
  assert.equal(
    paths['/api/v1/bookings'].post.requestBody.content['application/json']
      .schema.properties.requestId.format,
    'uuid',
  );
  assert.deepEqual(paths['/api/v1/payments/webhook'].post.security, []);
  assert.ok(
    paths['/api/v1/payments/webhook'].post.parameters.some(
      (entry) => entry.name === 'Stripe-Signature' && entry.required,
    ),
  );
  const unauthorized = await fetch(`${baseUrl}/api/v1/bookings/mine`);
  assert.equal(unauthorized.status, 401);
  await unauthorized.text();
  const live = await fetch(`${baseUrl}/health/live`);
  assert.deepEqual(await live.json(), { status: 'ok' });
});
