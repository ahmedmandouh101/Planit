# PROJECTS

## Development foundation

This repository is being modernized. It is not ready for production payments.
See [the roadmap](docs/ROADMAP.md) for the planned milestones.
See [local development](docs/LOCAL_DEVELOPMENT.md) for commands and verification.

### Local setup

1. Use Node.js 22 and install dependencies with `npm ci`.
2. Copy `.env.example` to `.env` and set `JWT_SECRET` to a random secret of at least 32 characters.
3. Start `npm run db:local` in another terminal for transaction-capable MongoDB on port 27018. Set `DATABASE_LOCAL` (or `DATABASE` for a hosted replica-set connection). See [inventory setup](docs/INVENTORY.md) when upgrading an existing local database.
4. Configure SMTP for welcome messages and password recovery. Run `npm run mail:local` to capture development email in Mailpit.
5. Run `npm run dev` for development or `npm start` for normal startup.
6. Run `npm test` for regression tests. With MongoDB and Mailpit running, also run `npm run test:integration`, `npm run test:bookings`, `npm run test:inventory`, and `npm run test:mail` for real-service integration tests.

Alternatively, run `npm run setup:local` to generate a private `.env` with a random
JWT secret and create the upload directories. Existing `.env` files are preserved.
Configure MongoDB and SMTP in that file, then run `npm run seed:demo` to add
fictional tours and places to your development database. Seeding requires
`NODE_ENV=development`; it does not delete records or replace existing names.
Use a dedicated development database, never your production database.
Demo tour images use `/demo-placeholder.svg` as their display URL.

`GET /health/live` checks that the HTTP app responds. `GET /health/ready` returns
200 when Mongoose is connected and 503 otherwise. These endpoints do not verify
SMTP or Stripe availability.

Set `NODE_ENV=production` through the hosting environment for deployment.
The booking flow creates unpaid, pending requests. Customers can separately hold seats for up to 15 minutes on published departures; holds do not confirm payment. Run `npm run seed:departures` to publish sample departure inventory locally.
The legacy checkout route has been removed until booking-linked payments and verified webhooks are implemented. Do not use real payments yet.
Image uploads currently require writable `public/img/users` and `public/img/tours` directories.
Create those directories before testing uploads. Persistent object storage is planned.
Keep `.env` and `config.env` private. Existing `config.env` setups remain supported.

The root URL serves the English tour browser from `frontend/`. It uses native
HTML, CSS, and JavaScript with no build step. It fetches real tours and their
details from the same-origin API, supports difficulty filters, sorting, and
pagination. Text search filters the currently loaded results. API metadata is
available at `/api/v1`. Signup, login, logout, password recovery, saved experiences, booking requests, and My bookings are implemented.
Protected routes accept an HttpOnly session cookie or `Authorization: Bearer <token>`.
Logout clears the browser cookie; password changes invalidate earlier sessions. Bearer tokens are not individually revoked on logout.
See [accounts](docs/ACCOUNTS.md), [booking rules](docs/BOOKINGS.md), and [CI](docs/CI.md) for behavior and limitations.

---

## 1. Booking APP (PLAN IT)

**PLAN IT** is a tour booking app reshaping the travel experience. It simplifies booking for tours, hotels, restaurants, and entertainment venues on one convenient platform. PLAN IT elevates every aspect of travel planning. Our mission: to empower travelers to effortlessly create dream vacations with confidence.

**Date:** 02/2024

### Key Features

- **Back-end Stack:** Node.js, Express, MongoDB, and Mongoose (MongoDB JS driver).
- **Feature-rich RESTful API:** Includes filters, sorts, pagination, and much more.
- **CRUD Operations:** Implemented with MongoDB and Mongoose.
- **Advanced Authentication and Authorization:** Including password reset functionality.
- **Security Measures:** Encryption, sanitization, rate limiting, etc.

### Technologies Used

- **Back-end:** Node.js, Express
- **Database:** MongoDB (NoSQL)
- **Additional Libraries/Tools:** 
  - Mongoose (ODM for MongoDB)
  - JSON Web Tokens (JWT) for authentication
  - Bcrypt for password hashing
  - Express-validator for input validation
  - Helmet for HTTP headers security
  - Express-rate-limit for rate limiting
  - Morgan for HTTP request logging

### Installation

1. Clone the repository.
2. Install dependencies using `npm ci` with Node.js 22.
3. Follow the local setup instructions above to configure `.env` and services.
4. Run the server using `npm start`.

### Usage

1. Access the API endpoints using tools like Postman or through your front-end application.
2. API documentation is planned; inspect `routes/` for the current endpoints.


## **Live Demo**

The End Points is deployed and can be accessed at the following link:

[**P L A N I T.com - Live Application**](https://graduation-project-1fv9.onrender.com/api/v1/places/)

Feel free to explore the features and functionality of the platform.

### Contributing

Contributions are welcome! Please feel free to submit pull requests or raise issues if you encounter any problems or have suggestions for improvements.

