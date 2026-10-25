# Core API reference

Run the app and open `/api-docs` for a read-only endpoint reference. Download
`/docs/openapi.json` for the OpenAPI 3.0.3 contract. Both are public, same-origin,
and require no external scripts, CDN, documentation account, or credentials.
The page intentionally has no “try it” buttons: browsing docs never creates
bookings, changes accounts, or starts checkout.

The contract is authored in `docs/openapi.js` and served as JSON, not JavaScript.
It covers health, signup/login/logout/recovery, profile reads, favorites, tour
reads, customer bookings/holds, departure availability/admin configuration,
and test checkout/webhooks. The introduction explicitly lists legacy APIs that
are not covered yet. This is not a claim that the entire legacy API is audited.

## Authentication and examples

Login/signup set an HttpOnly `jwt` cookie and return a bearer token. Protected
operations accept either method, not both together. Same-origin browser clients
automatically use the cookie; keep bearer tokens out of URLs, screenshots, and
shared documentation. Logout clears the cookie but does not revoke each bearer
token individually. Production cookies require HTTPS.

Read-only examples (substitute your local port if needed):

```sh
curl http://localhost:3000/health/live
curl http://localhost:3000/api/v1/tours?limit=12
curl http://localhost:3000/docs/openapi.json
```

Tour listing returns `data.data`; customer booking reads use `data.bookings`
or `data.booking`. These intentionally describe the existing API rather than
silently changing response envelopes. Booking body `requestId` is a client UUID
v4 used for idempotency; response `X-Request-ID` is a separate server tracing ID.

## Maintenance and limitations

Update the contract with every change to a documented endpoint. `npm test`
checks internal references, unique operation IDs, path parameters, publishing,
security declarations, and basic real HTTP behavior. These are focused
regression tests, not a full OpenAPI standards validator or runtime schema
enforcement. Existing database/inventory/payment integration suites remain the
source of behavioral verification. Real hosted Stripe sandbox verification is
still pending; publishing documentation does not enable payments.

No staging service is provisioned by this documentation milestone. Hosting,
production SMTP, database credentials, storage, backups, and deployment access
still need explicit configuration before a public deployment.
