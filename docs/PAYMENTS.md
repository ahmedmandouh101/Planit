# Stripe test checkout

This integration accepts **Stripe test keys and test events only**. Live keys are rejected. It does not enable real payments. The automated suite uses real MongoDB transactions and real Stripe webhook signature verification, but mocks the external Stripe API; a real sandbox checkout still needs the account setup below.

## Local account setup

1. Create or sign in to your own Stripe account and use its test environment/sandbox. Follow the [Stripe testing guide](https://docs.stripe.com/testing). Do not send API keys or webhook secrets in chat or commit them.
2. Start `npm run db:local`, then the API with `npm start`.
3. Install the official [Stripe CLI](https://docs.stripe.com/stripe-cli), authenticate it yourself with `stripe login`, then run:

   ```text
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired --forward-to localhost:3000/api/v1/payments/webhook
   ```

4. Set `STRIPE_SECRET_KEY` to your `sk_test_...` key and `STRIPE_WEBHOOK_SECRET` to the `whsec_...` signing secret printed by **that listener**, in ignored `.env`. Set `PUBLIC_APP_URL=http://localhost:3000`. Dashboard endpoint secrets and CLI listener secrets are different. Restart the API after editing `.env`; update the secret if the listener changes.
5. Log in, request a published departure, acquire a seat hold, and choose **Pay with Stripe · test mode** in My bookings. Enter only Stripe's documented test payment details in the hosted checkout yourself. Card details never enter Planit's frontend or database.
6. The forwarded signed webhook should change the booking to **Confirmed · Paid**. Returning to the site does not confirm a payment. Use Refresh bookings to see the server's verified state.

No publishable key or Stripe.js is required for this hosted redirect flow. Only the server uses the secret API key. Checkout uses the existing Stripe SDK pinned to API version `2024-04-10`; review SDK/API upgrades separately before any production deployment.

## API and verification

- Public `GET /api/v1/payments/status` reports test-mode configuration readiness, never credentials.
- Authenticated owner `POST /api/v1/bookings/:id/checkout` returns a hosted Stripe URL. It requires a future, unpaid pending booking with a currently valid seat hold, a valid USD total of at least $0.50, and enough time before departure.
- Owner `POST /api/v1/bookings/:id/checkout/cancel` asks Stripe to expire its open session, verifies the resulting state, and then releases seats. If payment wins the race, the booking is confirmed instead and cancellation returns 409. It leaves an unpaid request pending when checkout is closed, so the user can acquire another hold or cancel the request separately.
- Public `POST /api/v1/payments/webhook` verifies the `Stripe-Signature` against the **raw request body**, before Express JSON parsing or sanitization. Invalid signatures and live events are rejected. The endpoint needs no login cookie.

Session mode, test/live flag, booking reference, attempt metadata, session ID, expected amount, currency, and payment-intent ID are checked before fulfilling a paid session. An unpaid completion does not confirm the booking. Browser-supplied prices, payment flags, return hashes, and query strings are never payment proof.

Confirmation can come from a valid signed webhook or reconciliation against Stripe's authenticated server API after delivery delays. A successful payment keeps the departure's reserved-seat counter unchanged and turns the temporary hold into a confirmed allocation. Customer cancellation/refunds of an ordinary confirmed booking are not implemented yet.

## Holds, attempts, and failure handling

Stripe [requires Checkout expiry between 30 minutes and 24 hours](https://docs.stripe.com/api/checkout/sessions/create?query=expires_at). An ordinary Planit hold is 15 minutes. Starting checkout persists an attempt, sets a **35-minute Stripe expiry**, and extends/protects the seat allocation for checkout. The displayed local hold deadline is 37 minutes from preparation, but it is **not** permission to release a still-open or unverified Stripe session.

While checkout is locked, normal expiry cleanup, hold changes, and request cancellation cannot release its seats. This prevents a customer paying through a still-valid Stripe page after Planit resells the same seats. Closing the browser or clicking Stripe's back link does not itself expire checkout: use **Cancel checkout** or wait for provider-verified expiration.

Attempts have durable states (`creating`, `open`, `paid`, `expired`, `refund_pending`, `refunded`), a unique active attempt per booking, unique Stripe session/payment-intent references, and stable idempotency keys. All creation parameters are derived from persisted data, including the trusted origin and stored booking total. A lost response after session creation retries the same attempt/session rather than creating another chargeable checkout.

Webhook effects are idempotent by attempt/session state, including concurrent deliveries and an expired event received after payment. Transitions between the booking and attempt are transactional. Stripe calls are outside retryable database transactions; they have independent idempotency keys.

A reconciliation worker runs every minute and resumes after restarts. It retrieves active sessions, recovers unknown creation responses through the original idempotency key, applies completed/expired state, and retries pending refunds. If Stripe or its credentials are unavailable, uncertain sessions **fail closed**: seats remain protected. Restore the correct original test-account configuration and inspect the attempt/session when an error persists. Do not manually decrement counters or rotate to another Stripe account to clear a lock. A permanent creation/validation error can require operator investigation; this test integration does not automatically assume that an unknown provider outcome means no payment exists.

If a verified paid event cannot safely confirm its original allocation (e.g. an already-released/expired attempt), the attempt becomes `refund_pending` and the charge is refunded using a stable refund idempotency key. A failed network call is retried; pending refunds are retrieved by refund ID until Stripe reports success. The booking is not falsely marked paid or refunded. Provider-reported failed/cancelled refunds require operator review. A stale paid attempt never takes seats away from a newer checkout on the same booking.

## Automated tests and remaining live verification

Run `npm run test:payments` with the local replica set running. No external Stripe account or credentials are used: the SDK's API methods are replaced with deterministic test doubles, while its real HMAC signature implementation and the actual raw-body HTTP endpoint are exercised.

The suite verifies configuration/ownership guards, concurrent creation, server pricing, return-page tampering, invalid signatures, unpaid/live/mismatched events, duplicate/out-of-order events, unknown remote outcomes, fail-closed allocation, expiry reconciliation, cancellation/payment races, refund retry/deduplication, and transaction rollback/retry. CI includes it alongside the other suites.

Before relying on a sandbox demo, complete a real hosted test checkout, forward signed events with Stripe CLI, test authentication/3-D Secure and cancellation, stop/restart the listener/API to verify recovery, and inspect Stripe's session/payment/refund records. Production launch remains out of scope: live keys are deliberately blocked, and operational alerting, customer refund policies, permanent-error recovery tooling, and deployment configuration still need separate work.
