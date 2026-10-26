# Planit backend architecture

Planit is an Express/Mongoose monolith with a same-origin buildless client.
MongoDB must support transactions (replica set or sharded cluster).

## Request path

Request ID -> security headers -> endpoint-specific raw payment webhook or
static/customer docs routes -> API rate limiter -> JSON parsing/sanitization
-> authentication and authorization -> controller/domain service -> Mongoose
-> safe response/error handling.

## Core domain boundaries

- Accounts: password hashing, JWT authentication, recovery token lifecycle,
  current-user access, and account favorites. Cookie logout does not revoke
  previously issued bearer tokens individually.
- Booking requests: owner-derived identity, server price snapshots in USD,
  date/group validation, and UUID-based idempotency backed by unique indexes.
- Inventory: scheduled departures, atomic capacity counters, temporary holds,
  and recoverable expiry. Transactions roll back both counter and booking state.
- Payments: durable attempts, provider idempotency keys, signed raw webhooks,
  and reconciliation. Stripe network requests stay outside retryable database
  transactions. Unknown provider outcomes retain protected seats rather than
  assuming it is safe to release them. Test-only; real hosted verification pending.

## Operational boundaries

Expiry/reconciliation workers run inside the server process. Database predicates
and transactions guard concurrent actions, but durable external job processing
and full operational monitoring are not implemented. Uploads are validated and
re-encoded, then stored on local disk; file and DB writes are not atomic.

## Interview/CV evidence

Accurate description: “Developed a Node.js/Express/MongoDB booking application
with transactional seat holds, server-side pricing, idempotent booking requests,
JWT authentication, signed Stripe test webhooks, and automated concurrency and
rollback tests in CI.”

Do not claim live payments, public production deployment, measured performance,
or complete security certification. Link the repository, passing CI, API reference,
and a verified demo when available. See PRODUCTION_READINESS.md for release gates.
