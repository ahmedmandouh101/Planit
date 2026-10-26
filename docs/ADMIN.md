# Admin studio

Open `/admin` on the running application. Anonymous visitors receive a login
prompt; authenticated non-admin users see access denied. The navigation link
appears only for an administrator. Every management API independently checks
authentication/roles; hiding UI controls is not the authorization boundary.

No existing user is promoted automatically. Use an already provisioned admin
account. Any first-admin provisioning must be an explicit, trusted operator
action for a specific account, not a public signup option. Never commit credentials.

## Delivered workflows

- Paginated admin tour catalog including hidden tours:
  `GET /api/v1/admin/tours?page=1` (25 records plus hasMore, no-store).
- Create/edit basic tour metadata through the existing protected tour API:
  name, summary, description, price, duration, group size, activity level,
  visibility, and existing cover filename. Creation defaults to hidden in the UI.
  Model validators bound price to 0–1,000,000 USD, integer duration to 1–365,
  and integer group size to 1–1000. Changes do not rewrite booking price snapshots.
- Configure a published tour's departure date, capacity (1–1000), and closed
  state through the existing transactional departure endpoint. Select an existing
  departure to populate its values. Capacity cannot shrink below reserved seats.
  Tours with configured startDates still require an offered date.
- Paginated read-only booking ledger. Customer profiles are not displayed.
  Generic booking PATCH/DELETE remain disabled, including for admins; the UI
  cannot mark bookings paid or alter seat counters.

## Boundaries

Tour deletion, gallery upload/asset management, offered-date editing, operator
refund actions, analytics, and an admin audit trail are not implemented in this
screen. The cover field refers to an existing file; the default is an explicitly
demo illustration, not an uploaded photo. Hidden tours must be published before
departure management through the current availability endpoints.

The admin catalog is bounded and intentionally does not accept arbitrary filters
or projection. Admin booking reads are marked no-store. Browser request-version
guards stop older account responses from repopulating the screen after logout.

Run npm run test:admin with the local replica set. It creates isolated admin and
customer fixtures in planit_test and removes only those records. Tests cover
401/403 authorization, hidden tour access, pagination, metadata validation,
departure configuration, booking ledger privacy, and disabled payment overrides.
CI runs the suite alongside the existing concurrency and inventory tests.
