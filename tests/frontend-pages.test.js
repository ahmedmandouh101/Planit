const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../app");
let server;
let baseUrl;
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});
test("customer pages support direct navigation and refresh without shadowing API errors", async () => {
  for (const route of [
    "/explore?q=Cairo",
    "/saved",
    "/trips",
    "/profile",
    "/admin",
    "/tours/507f1f77bcf86cd799439011",
  ]) {
    const response = await fetch(baseUrl + route);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /src="\/workspace.js"/);
    assert.match(html, /href="\/journey-theme.css"/);
    assert.match(html, /Application navigation/);
    assert.match(html, /id="auth-dialog"/);
  }
  const missing = await fetch(`${baseUrl}/api/v1/missing`);
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get("content-type"), /application\/json/);
});
test("workspace assets are served with same-origin security headers", async () => {
  for (const route of [
    "/workspace.js",
    "/admin.js",
    "/workspace.css",
    "/experience.js",
    "/journey-theme.css",
  ]) {
    const response = await fetch(baseUrl + route);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-security-policy"));
    await response.text();
  }
});
