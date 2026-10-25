# Booking requests

Open a tour's **View details**, log in, choose a date and guest count, and submit a booking request. Use **My bookings** to view requests or cancel an unpaid pending request before its departure date. Cancellation requires a second click to confirm.

Requests begin **pending and unpaid**. Requests alone do not reserve inventory. Customers can acquire a temporary seat hold on a published departure, then use [Stripe test checkout](PAYMENTS.md) when configured. Provider-verified payment confirms the allocation. `MaxGroupSize` limits guests per request; departure capacity limits aggregate held and confirmed seats. Live payments are blocked.

## Rules

- Dates are calendar dates in UTC and must be strictly after today. Dates with invalid calendar values are rejected. When a tour has `startDates`, the date must appear in that list. When none are configured, any future date can be requested, subject to later confirmation.
- Guests must be a positive integer no greater than the tour's configured `MaxGroupSize`. Tours without a valid group limit cannot accept requests. Secret and missing tours cannot be booked.
- The server reads the tour price, rounds to USD cents per person, and multiplies by guests using safe integers. It snapshots the unit price, total, currency, and tour name. Client-supplied ownership, price, payment, and status fields are ignored. Price discounts are not applied in this release.
- Every creation needs a UUID v4 `requestId`. Retrying identical details with the same ID returns the existing request, including its cancelled status. Reusing that ID with different details returns 409. Atomic unique indexes protect simultaneous requests; the server waits for booking indexes before listening.
- A user can have only one pending request per tour/date. After cancellation, a fresh request ID allows rebooking. Existing unpaid requests do not represent held seats.
- Owner operations always filter by the authenticated user ID. Other users receive 404 on cancellation, and cannot read another user's list through query parameters. Responses exclude user records and internal request IDs.
- Cancellation is an atomic conditional update. Paid, departed, and other non-cancellable records return 409. Repeating a successful cancellation returns the existing cancelled record. Records remain available as history.

## API

All endpoints require the session cookie or a bearer token.

- `POST /api/v1/bookings`: `{ "tourId": "...", "departureDate": "2030-06-15", "guests": 2, "requestId": "UUID-v4" }`. Returns 201 for creation, 200 for an identical retry, 400 for invalid input, 404 for unavailable tours, or 409 for conflicting requests/unavailable pricing.
- `GET /api/v1/bookings/mine?page=1`: twelve requests per page, newest first, with `hasMore`.
- `PATCH /api/v1/bookings/:id/cancel`: owner-only cancellation; no body required.

Administrative reads are admin-only. Generic booking updates and deletion are disabled so they cannot bypass inventory accounting. Generic creation was replaced by the validated request flow. The legacy checkout route and URL-query booking helper were removed. The new Stripe test integration uses booking-linked sessions and verified server-side payment state, never browser redirect parameters.

Legacy documents are not deleted or rewritten. Records missing new booking fields display unavailable details and cannot be cancelled through the new owner endpoint. Before enabling a shared database, check for conflicting pending records before building the unique indexes.

## Verification

Run `npm run test:bookings` with local MongoDB running. Tests use `planit_test`, create isolated users/tours, and clean up only their own data. They verify anonymous rejection, price/identity tampering, same-key concurrent retries, duplicate pending requests, account isolation, cancellation, date and guest validation, listed departures, secret tours, paid/departed rejection, and pagination. CI runs this suite alongside authentication and SMTP tests.
