# Accounts and saved experiences

Use **Log in / Sign up** in the homepage header. Signup requires a name, email, and matching passwords of at least eight characters. MongoDB must be running; Mailpit captures the welcome email locally. A welcome email failure does not prevent an already-created account from signing in.

The browser authenticates with the existing JWT cookie, now marked `HttpOnly` and `SameSite=Strict` (`Secure` in production). JavaScript does not persist the token. Existing API clients can still send `Authorization: Bearer <token>`. Logout replaces the browser cookie; previously issued bearer tokens remain valid until expiry.

The page restores the session using `GET /api/v1/users/me`. Account favourites are stored on the user document and are separate from guest favourites in browser storage. Logging in does not automatically copy guest favourites into an account.

Authenticated routes:

- `GET /api/v1/users/saved-tours`: populated saved tours for the current user.
- `PUT /api/v1/users/saved-tours/:tourId`: save an existing tour, without duplicates.
- `DELETE /api/v1/users/saved-tours/:tourId`: remove a saved tour.

The server always derives the user ID from authentication. Request bodies cannot select another user's saved collection. The generic profile update route cannot modify it. MongoDB `$addToSet` and `$pull` make changes atomic.

Run `npm test`, `npm run test:integration`, and `npm run test:mail`. The integration test verifies cookies, anonymous rejection, isolation between two accounts, duplicate saves, invalid and missing tours, removal, and logout cookies against real MongoDB.

Next: password reset UI, then booking dates and checkout. Deployment needs HTTPS for production cookies.
