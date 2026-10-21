# Local development

## First run

```powershell
npm ci
npm run setup:local
```

The setup command creates `.env` only if it does not exist. It generates a random
JWT signing secret and prepares image upload directories. `.env` is ignored by
Git; `.env.example` documents configuration without containing real secrets.

Install and start MongoDB Community locally. The default development connection
is `mongodb://127.0.0.1:27017/planit`. If using a different development database,
edit `.env` locally.

```powershell
npm run seed:demo
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
It uses a separate `planit_test` database on `127.0.0.1:27017`, creates a uniquely
named user, and removes that user afterward. Email delivery alone is mocked;
this command does not verify SMTP. It does not load `.env` or use a remote database.

Configure an SMTP server before testing signup and password reset. The current
signup handler saves the account and then awaits its welcome email. If SMTP fails,
the request fails even though the account may already exist. Email reliability
and a full authentication integration test are follow-up work.

Use `Authorization: Bearer <token>` for protected requests. Do not put tokens or
credentials in commits, screenshots, or documentation.

## Git workflow

Development continues on `development`. Review changes with `git diff`, run
`npm test`, and create commits yourself. Future feature work can use separate
branches and pull requests into `development`; stable releases merge into `main`.

The GitHub Actions workflow provides CI by installing dependencies and running
regression tests plus the authentication integration test against a temporary
MongoDB 8.0 service container. A Mailpit service also verifies real SMTP delivery
and password reset. Deployment automation (CD) is not configured yet.
