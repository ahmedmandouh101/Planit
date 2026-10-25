# Request tracing

Every response has a server-generated `X-Request-ID`, including static files,
health checks, and payment webhooks. Client-supplied IDs are not trusted.
Unexpected production error responses also include that ID in the JSON body.

With `NODE_ENV=production`, completed or disconnected HTTP requests emit one
JSON line to stdout: timestamp, request ID, method, matched route template,
status code, duration in milliseconds, and an aborted flag. Unmatched routes
are labelled `unmatched`; concrete paths and query strings are not logged.

Request bodies, headers, cookies, user identifiers, IP addresses, payment
payloads, and raw error messages are deliberately excluded. Unexpected HTTP
errors emit a minimal correlated `request_error` event to stderr. This avoids
accidentally recording credentials contained in third-party error objects.
These request logs are not a full audit trail or an exception monitoring system;
startup and background-worker logs retain their existing behavior.

For support, capture the response's request ID from the browser Network panel,
then search the hosting platform's stdout/stderr for that ID. Configure log
retention and restricted access on the eventual hosting platform. Do not expose
logs as a public API. Development retains its existing Morgan console output.

Run `npm test` for request-log privacy and error-correlation regression tests.
