# Production readiness: evidence and remaining gates

Do not describe the application as production-ready until staging and operational
verification have passed. A clean dependency audit is not a security guarantee.

## Hardening delivered

- Patched production dependencies, keeping Express 4 and Mongoose 8. Multer,
  Nodemailer, and Sharp were upgraded with image/SMTP regression verification.
  Recheck `npm audit --omit=dev` regularly; advisories change over time.
- CI runs a high/critical production dependency audit after `npm ci`.
- Generic Tour/Place/Driver/Review/User writes accept explicit field lists.
  Unknown fields, update operators, immutable IDs, and tour rating aggregates
  are rejected. This is field control, not complete semantic request validation;
  schema validation and existing authentication/ownership checks still apply.
- Generic list pagination is bounded: page 1–10000 and limit 1–100 (default 100).
- Multipart limits: 5 MiB per file, four files, 20 text fields, 16 KiB per field,
  and 24 parts. Tour routes allow one cover and three gallery images; profiles
  allow one photo. JPEG, PNG, and WebP only, with actual format/decode checks,
  a 16-million-pixel input bound, no animated images, and JPEG re-encoding.
  Generated filenames never use client filenames or route IDs. Cover-only and
  gallery-only tour updates are supported. Existing uploads are not deleted.
- Startup validates configuration. In production set DATABASE (remove
  DATABASE_LOCAL), a credential-free HTTPS PUBLIC_APP_URL origin, JWT_SECRET,
  EMAIL_HOST, EMAIL_FROM, EMAIL_PORT, and explicit EMAIL_SECURE=true/false.
  SMTP username/password must be supplied together when authentication is used.
  Production SMTP requires TLS (implicit TLS or STARTTLS); local Mailpit is
  development-only. Without EMAIL_HOST, a complete legacy SendGrid credential
  pair remains supported. An explicit SMTP host takes precedence over SendGrid.
  Use platform secrets, not a committed environment file. Stripe is optional.

## Outstanding release gates

- Full legacy endpoint/input validation and authorization audit, including
  data visibility, review eligibility, and session/token lifecycle decisions.
- Real Stripe sandbox verification; live payments remain disabled.
- Hosted MongoDB replica set, least-privilege credentials, network restrictions,
  tested backups/restoration, and index/migration checks on representative data.
- Trusted HTTPS proxy configuration, production email delivery, and staging
  user journeys. Do not blindly enable trust proxy for arbitrary forwarded IPs.
- Persistent image/object storage and cleanup on failed DB writes. Upload
  storage remains local; filesystem/DB writes are not an atomic transaction.
- Error monitoring, alerting, log retention/access, and measured load testing.
- Staging deployment and a verified public demo before claiming deployment.

Run npm test plus test:integration, test:bookings, test:inventory, test:payments,
and test:mail with the documented local services. Payment-provider requests in
automated tests are mocked. Dependency audits require npm registry access.
