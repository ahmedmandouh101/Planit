# Customer application

## React migration

The first isolated React preview lives in `client/` and is served at `/react/`
after `npm --prefix client ci` and `npm run build:client`. It currently contains
an API-backed tour catalog with loading, empty and error states, retry,
paginated loading, cover images and a details toggle. Demo records retain their
label. Existing customer pages remain available while migration continues.
Use `npm run dev:client` alongside the backend on port 3000; Vite proxies API
and image requests to it. React tests run with `npm run test:client`.
See [the first React lesson](REACT_LEARNING.md) and
[loading real tours](REACT_TOUR_CATALOG.md) for setup and concepts.

## Existing application

The frontend uses native HTML, CSS, and JavaScript, not React. Express serves
a shared shell on explicit customer routes, including direct refreshes.

- `/`: homepage and destination entry points.
- `/explore`: catalog; q, difficulty, sort, budget, and duration restore from URL parameters.
  Budget and duration filter through the API as well as on rendered favorites.
  Search applies to loaded results, not the entire database.
- `/tours/:id`: standalone tour details, availability, and authenticated booking.
- `/saved`: browser-local guest favorites or authenticated account favorites.
- `/trips`: private history, holds, cancellation, and configured test checkout.
- `/profile`: name/email editing through the existing authenticated API.
- `/admin`: role-gated tour metadata/departure management and read-only booking
  ledger. See [admin studio](ADMIN.md) for access and feature boundaries.

Authentication/recovery remain dialogs. Tour and booking views reuse existing
domain actions in non-modal page panels. Live payments are disabled and hosted
Stripe sandbox verification remains pending. Seeded tours remain marked Demo.

Structured itinerary/inclusions data, multi-image galleries, and
full-database destination search remain future milestones, not shipped features.
Run npm test for direct-route regression checks; browser QA checks interactions.
