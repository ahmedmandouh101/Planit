# PROJECTS

## Development foundation

This repository is being modernized. It is not ready for production payments.
See [the roadmap](docs/ROADMAP.md) for the planned milestones.

### Local setup

1. Use Node.js 22 and install dependencies with `npm ci`.
2. Copy `.env.example` to `.env` and set `JWT_SECRET` to a random secret of at least 32 characters.
3. Start MongoDB and set `DATABASE_LOCAL` (or `DATABASE` for a hosted connection).
4. Configure SMTP for signup welcome messages and password resets. Signup currently awaits email delivery.
5. Run `npm run dev` for development or `npm start` for normal startup.
6. Run `npm test` for regression tests. These mock database and email boundaries; real service integration is still pending.

Set `NODE_ENV=production` through the hosting environment for deployment.
Stripe is optional at startup; checkout returns 503 until `STRIPE_SECRET_KEY` is configured.
Payment confirmation via verified webhooks is still pending. Do not use real payments yet.
Image uploads currently require writable `public/img/users` and `public/img/tours` directories.
Create those directories before testing uploads. Persistent object storage is planned.
Keep `.env` and `config.env` private. Existing `config.env` setups remain supported.

The root URL returns API metadata. Protected routes use `Authorization: Bearer <token>`.
Cookies are issued, but cookie-based authentication and token revocation on logout are not implemented.

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

