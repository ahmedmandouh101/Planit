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

## Password recovery

Open **Log in / Sign up → Forgot your password?**. Submit the account email and follow the link in Mailpit at `http://localhost:8025` during development. The link opens the new-password form; successful reset signs the user in and invalidates their previous sessions, including sessions issued within the same second.

Set `PUBLIC_APP_URL` to the trusted application origin. It defaults to `http://localhost:3000` (or the configured `PORT`) locally. Production requires an explicit HTTPS origin. Reset emails never use the incoming Host header to construct links.

Reset tokens expire after ten minutes, are stored hashed, and can only be consumed once, including concurrent attempts. The link carries the token in a URL fragment, which is not sent to the server; the page removes it from browser history immediately and keeps it only in memory while the form is open. Closing or refreshing the form requires reopening the original email link.

The API returns the same success message for registered and unknown email addresses. Recovery endpoints share a limit of ten attempts per IP per fifteen minutes. SMTP failures clear only the token created by that failed request, without removing a newer request's token. Reset token fields are excluded from normal user queries.

`npm run test:mail` checks the real email link, trusted origin despite a spoofed Host header, hashed tokens, password validation, expiry, simultaneous reuse, old-session rejection, and the new authenticated cookie. `npm test` also checks input validation and recovery request limits.

Next: booking dates and checkout. Deployment needs HTTPS for production cookies.
