# Departure inventory and seat holds

Bookings remain unpaid requests until a separate confirmation flow is implemented. A request alone does not reserve seats. Customers can now acquire a temporary hold in **My bookings** for a published departure, release it, or cancel the request. Scheduled departures and remaining capacity are visible in the tour details.

## Local database

Inventory uses multi-document transactions. Start `npm run db:local` in a separate terminal before starting the API. It runs the installed MongoDB binary as a single-node replica set named `planit-rs`, bound only to `127.0.0.1:27018`. Its persistent data and log are under ignored `.local/mongodb-rs/`. No Windows service or administrator access is needed. Set `MONGOD_BIN` if MongoDB is not at the default installation path.

Use `DATABASE_LOCAL=mongodb://127.0.0.1:27018/planit?replicaSet=planit-rs` in `.env`. The existing standalone Windows service on port 27017 is separate and remains untouched. API startup checks transaction support and fails clearly rather than running unsafe fallback writes. A single-node replica set enables transactions for development; it is not a high-availability production deployment.

For an existing local project, stop the API and run `node scripts/copy-legacy-local.js` once to copy `planit` collections and indexes from port 27017 into an **empty** target on port 27018. It refuses to overwrite an existing target and never modifies the source. If a copy is interrupted, preserve both databases and review the partial target before retrying; do not point new application writes back at the older source. The data copy is a development helper, not a production backup/migration tool.

Run `npm run seed:demo`, then `npm run seed:departures` to publish demonstration dates. The latter runs only in development, touches only the two named demo tours, includes their existing future pending-request dates, and preserves any existing departure capacities and holds. If a tour has an explicit `startDates` list, those dates are used instead.

Production requires a transaction-capable replica set or sharded MongoDB cluster, e.g. an appropriately configured hosted deployment. A standalone database is unsupported for inventory operations.

## API

- Public `GET /api/v1/departures?tourId=...` lists up to 60 upcoming departures in UTC date order. It returns date, capacity, available seats, and closed status; no customer or booking data. Availability is a snapshot, not a promise.
- Admin-only `PUT /api/v1/departures` takes `{ "tourId": "...", "date": "2030-06-15", "capacity": 12, "closed": false }`. Dates must be future calendar dates offered by the tour when `startDates` is configured. Capacity must be an integer from 1 to 1000. Updates cannot shrink capacity below seats currently held. Omitting `closed` preserves it on updates; new departures default to open.
- Owner-only `POST /api/v1/bookings/:id/hold` acquires seats for at most 15 minutes, ending no later than the departure date. Guests and expiry come from server data, not the request body. Retrying an active hold returns the original expiry without extending it. After expiry or release, the owner can explicitly try again, subject to availability.
- Owner-only `DELETE /api/v1/bookings/:id/hold` releases seats while keeping the request pending. Repeating release is safe. Cancelling a held request releases seats and changes the booking state in the same transaction.

Only future unpaid pending requests on non-secret, eligible tours can acquire holds. Closed departures reject new holds but existing holds remain valid until release, cancellation, or expiry. A missing inventory record returns 409 rather than inventing capacity. Group-size limits and available seats are independent constraints.

Generic administrative booking updates/deletion are disabled, including for old bookings, so they cannot bypass inventory accounting. Administrative reads remain available. A future paid-booking/refund flow must use purpose-built transactional transitions.

## Atomicity and expiry

The departure's `reservedSeats` counter and booking hold metadata are updated in one MongoDB transaction using snapshot reads and majority writes. The allocation condition checks remaining capacity in the database. Contending requests cause a transaction retry; the losing request sees the updated counter and receives 409 if insufficient seats remain. Errors roll back both documents, including a failure after the counter increment.

Expired unpaid holds are released transactionally before allocation and availability reads. A background worker also checks every 30 seconds, with startup recovery and owner-list cleanup. Correctness does not depend on an in-memory timer or a TTL deletion: requests clean up relevant expired holds before allocating seats, and booking history is retained. Cleanup can safely run on multiple API instances because conflicting transactions retry against the updated state.

Ordinary holds do not authorize a charge or confirm a booking. [Stripe test checkout](PAYMENTS.md) now links to the booking/hold and protects its allocation until provider-verified payment or expiration. Checkout-locked records are excluded from ordinary hold cleanup; confirmed paid allocations continue to count against capacity. Live payments remain blocked.

## Verification

All integration tests now target isolated `planit_test` on port 27018. Run `npm test`, `npm run test:integration`, `npm run test:bookings`, `npm run test:inventory`, and `npm run test:mail` (Mailpit required for the last command). Inventory tests check concurrent oversubscription, hold retry expiry, release/cancel races, lazy and worker expiry, capacity changes, closed departures, ownership, admin write guards, and injected-failure rollback against real MongoDB transactions.

CI initializes the same single-node replica-set topology using the kernel-compatible MongoDB 7.0.45 image. Local development uses the installed MongoDB 8 binary. Neither test path uses a production database or production payment credentials.
