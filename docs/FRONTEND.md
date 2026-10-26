# Customer application

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

Authentication/recovery remain dialogs. Tour and booking views reuse existing
domain actions in non-modal page panels. Live payments are disabled and hosted
Stripe sandbox verification remains pending. Seeded tours remain marked Demo.

An admin UI, structured itinerary/inclusions data, multi-image galleries, and
full-database destination search remain future milestones, not shipped features.
Run npm test for direct-route regression checks; browser QA checks interactions.
