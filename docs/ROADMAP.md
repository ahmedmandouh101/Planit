# Planit development roadmap

## 1. Reliable foundation (in progress)

- Secure signup, driver mutations, and review ownership.
- Make local startup repeatable and document required services.
- Add regression tests and continuous integration.
- Audit and upgrade dependencies before public deployment.
- Verify authentication, email, image uploads, and database queries with real services.

## 2. Booking domain

Delivered: server-priced pending requests, date/guest validation, idempotent submission, owner history/cancellation, scheduled departure capacity, transactional temporary seat holds, expiry recovery, and real MongoDB concurrency/rollback tests. See [booking rules](BOOKINGS.md) and [inventory rules](INVENTORY.md). Requests alone do not reserve seats; explicit holds are temporary and unpaid.

- Model tour departures, capacity, travelers, and booking status.
- Calculate prices on the server and prevent overbooking.
- Complete Stripe webhook signature verification and idempotent payment processing.
- Implement booking history, cancellation, and refunds.

## 3. API and engineering quality

- Define request validation and field allowlists for every write endpoint.
- Publish OpenAPI documentation and reproducible seed data.
- Add database integration tests, structured logs, and readiness checks.
- Review pagination limits, indexes, upload limits, and file storage.

## 4. Deployment

- Choose a hosting provider, domain, MongoDB service, and email provider.
- Configure production secrets, HTTPS, proxy trust, backups, and monitoring.
- Deploy a staging environment and exercise complete user journeys.
- Publish a verified demo and document architecture and engineering decisions.

## 5. Product expansion

- Add favorites and itinerary planning by city, budget, and duration.
- Add an admin interface and a client application.
- Introduce TypeScript incrementally after the core behavior is covered by tests.

## Portfolio evidence

Describe only shipped and verified features in the CV. Link the repository,
API documentation, demo, and CI checks. Record measured performance results
only after running reproducible benchmarks.
