# Local development

## First run

```powershell
npm ci
npm run setup:local
```

The setup command creates `.env` only if it does not exist. It generates a random
JWT signing secret and prepares image upload directories. `.env` is ignored by
Git; `.env.example` documents configuration without containing real secrets.

Install MongoDB Community locally, then run `npm run db:local` in a separate terminal. It starts a single-node replica set on port 27018 with ignored local data. The default connection is `mongodb://127.0.0.1:27018/planit?replicaSet=planit-rs`. The replica set is required for atomic seat inventory. Existing port-27017 Windows service data stays separate; see [upgrade and copy instructions](INVENTORY.md) before switching an existing project.

```powershell
npm run seed:demo
npm run seed:departures
npm run dev
```

Seeding inserts fictional tours and places only when their names are absent. It
does not create accounts, delete records, or overwrite edited sample records.
Run it against a dedicated development database. Prices are sample values;
they do not represent actual travel offers.

## Verify the API

Open these URLs or use PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/health/live
Invoke-RestMethod http://localhost:3000/health/ready
Invoke-RestMethod http://localhost:3000/api/v1/tours
Invoke-RestMethod http://localhost:3000/api/v1/places
Invoke-RestMethod 'http://localhost:3000/api/v1/search?q=Demo'
```

`/health/live` confirms HTTP availability. `/health/ready` checks Mongoose
connection state. A running process can be alive while its database is unavailable;
readiness helps a load balancer avoid sending requests to that instance. The check
does not perform a database ping or verify email and payment services.

Run `npm test` for regression checks. Database and email calls in these tests are
mocked, so passing tests alone does not establish that the database or SMTP works.

## Authentication prerequisites

For local email, install [Mailpit](https://mailpit.axllent.org/docs/install/).
On Windows extract its executable into `.local/mailpit/mailpit.exe`, or set
`MAILPIT_BIN` to an installed executable. Run `npm run mail:local` in a separate
terminal. The script binds SMTP and the inbox to localhost only. Open
http://localhost:8025 to inspect captured emails. Keep `.env` configured with
`EMAIL_HOST=127.0.0.1`, `EMAIL_PORT=1025`, `EMAIL_SECURE=false`, and empty SMTP
credentials. Mailpit captures mail locally; it does not deliver to real inboxes.
These settings are for local development, not production.

Run `npm run test:mail` with local MongoDB and Mailpit running to test actual
SMTP delivery, signup, password reset, old password rejection, and single-use
reset tokens. It uses `planit_test`, removes its own temporary user afterward,
and leaves captured messages in Mailpit for inspection. Their reset links are
already consumed by the test and cannot be used again. This test overrides
email settings to localhost and does not load your private `.env`.

With local MongoDB running, `npm run test:integration` exercises signup, password
hashing, invalid and valid login, JWT authentication, and database readiness.
It uses a separate `planit_test` database on the port-27018 replica set, creates a uniquely
named user, and removes that user afterward. Email delivery alone is mocked;
this command does not verify SMTP. It does not load `.env` or use a remote database.

Configure SMTP before testing email delivery and password reset. Welcome email failure does not prevent an already-created account from signing in. Password-recovery delivery failures return an error and clear that request's token.

Run `npm run test:bookings` and `npm run test:inventory` for real MongoDB booking, capacity, expiry, concurrency, and rollback checks. Tests clean up their own fixtures. See [inventory documentation](INVENTORY.md) for API rules and limitations.

Use `Authorization: Bearer <token>` for protected requests. Do not put tokens or
credentials in commits, screenshots, or documentation.

## Git workflow

Current work is on `main` as requested. Review `git diff`, run the relevant tests, and create commits yourself. Separate feature branches and reviewed pull requests are suitable for later shared work.

The GitHub Actions workflow provides CI by installing dependencies and running
regression tests plus the authentication integration test against a temporary
MongoDB 7.0.45 replica-set container on port 27018. A Mailpit container also verifies real SMTP delivery
and password reset. Deployment automation (CD) is not configured yet.
