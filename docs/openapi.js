const reference = (name) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties, required = []) => ({
  type: 'object',
  properties,
  required,
});
const text = { type: 'string' };
const identifier = { type: 'string', pattern: '^[a-fA-F0-9]{24}$' };
const date = { type: 'string', format: 'date' };
const timestamp = { type: 'string', format: 'date-time' };
const password = {
  type: 'string',
  minLength: 8,
  maxLength: 72,
  writeOnly: true,
  description:
    'At most 72 UTF-8 bytes, not just 72 characters. Confirmation must match.',
};
const email = { type: 'string', format: 'email' };
const auth = [{ bearerAuth: [] }, { cookieAuth: [] }];
const envelope = (properties) =>
  object(
    { status: { type: 'string', enum: ['success'] }, data: object(properties) },
    ['status', 'data'],
  );
const response = (description, schema) => ({
  description,
  headers: {
    'X-Request-ID': {
      description:
        'Server-generated tracing ID; distinct from booking requestId.',
      schema: { type: 'string', format: 'uuid' },
    },
  },
  content: { 'application/json': { schema } },
});
const body = (schema) => ({
  required: true,
  content: { 'application/json': { schema } },
});
const parameter = (name, location, schema, required = true) => ({
  name,
  in: location,
  required,
  schema,
});
const errors = (...codes) =>
  Object.fromEntries(
    codes.map((code) => [
      code,
      { $ref: `#/components/responses/Error${code}` },
    ]),
  );
const operation = (operationId, tag, summary, schema, options = {}) => ({
  operationId,
  tags: [tag],
  summary,
  security: [],
  responses: {
    200: response('Success', schema),
    ...errors(400, 429, 500),
    ...options.responses,
  },
  ...Object.fromEntries(
    Object.entries(options).filter(([name]) => name !== 'responses'),
  ),
});
const bookingResponse = envelope({ booking: reference('Booking') });
const success = object({ status: { type: 'string', enum: ['success'] } }, [
  'status',
]);
const paths = {};
const add = (path, method, definition) => {
  paths[path] ||= {};
  paths[path][method] = definition;
};

for (const [name, states] of [
  ['live', ['ok']],
  ['ready', ['ready', 'unavailable']],
]) {
  add(
    `/health/${name}`,
    'get',
    operation(
      `health${name}`,
      'Operations',
      `Check ${name === 'live' ? 'HTTP liveness' : 'Mongoose connection readiness'}`,
      object({ status: { type: 'string', enum: states } }),
      {
        description:
          'Does not verify SMTP, Stripe, replica-set primary status, or worker health.',
        ...(name === 'ready'
          ? {
              responses: {
                503: response(
                  'Database disconnected',
                  object({ status: { type: 'string', enum: ['unavailable'] } }),
                ),
              },
            }
          : {}),
      },
    ),
  );
}
add(
  '/api/v1/users/signup',
  'post',
  operation(
    'signup',
    'Accounts',
    'Create a customer account',
    reference('AuthResponse'),
    {
      requestBody: body(
        object({ name: text, email, password, confirmPassword: password }, [
          'name',
          'email',
          'password',
          'confirmPassword',
        ]),
      ),
      description:
        'Roles supplied by clients are ignored. Sets an HttpOnly jwt cookie and also returns a bearer token. Confirmation must match password.',
      responses: {
        200: undefined,
        201: response('Account created', reference('AuthResponse')),
      },
    },
  ),
);
delete paths['/api/v1/users/signup'].post.responses[200];
add(
  '/api/v1/users/login',
  'post',
  operation('login', 'Accounts', 'Log in', reference('AuthResponse'), {
    requestBody: body(
      object({ email, password: { ...text, writeOnly: true } }, [
        'email',
        'password',
      ]),
    ),
    responses: errors(401),
  }),
);
add(
  '/api/v1/users/logout',
  'get',
  operation('logout', 'Accounts', 'Clear the browser session cookie', success, {
    description: 'Does not individually revoke existing bearer tokens.',
  }),
);
add(
  '/api/v1/users/forgetPassword',
  'post',
  operation(
    'forgotPassword',
    'Accounts',
    'Request a password-reset email',
    object({ status: text, message: text }),
    {
      requestBody: body(object({ email }, ['email'])),
      description:
        'Returns the same acknowledgement for known and unknown email addresses. Recovery routes share a 10-attempt/15-minute IP limit, in addition to the global API limit.',
    },
  ),
);
add(
  '/api/v1/users/resetPassword/{token}',
  'patch',
  operation(
    'resetPassword',
    'Accounts',
    'Reset password using an emailed token',
    reference('AuthResponse'),
    {
      parameters: [parameter('token', 'path', text)],
      requestBody: body(
        object(
          {
            password,
            confirmPassword: password,
          },
          ['password', 'confirmPassword'],
        ),
      ),
      description:
        'Confirmation must match. Invalid or expired tokens are rejected; successful reset invalidates earlier sessions.',
    },
  ),
);
add(
  '/api/v1/users/me',
  'get',
  operation(
    'profile',
    'Accounts',
    'Get the authenticated profile',
    envelope({ data: reference('User') }),
    { security: auth, responses: errors(401, 404) },
  ),
);
add(
  '/api/v1/users/saved-tours',
  'get',
  operation(
    'savedTours',
    'Favorites',
    'List saved tours',
    envelope({ tours: { type: 'array', items: reference('Tour') } }),
    { security: auth, responses: errors(401) },
  ),
);
for (const [method, verb] of [
  ['put', 'Save'],
  ['delete', 'Remove'],
]) {
  add(
    '/api/v1/users/saved-tours/{tourId}',
    method,
    operation(
      `${method}SavedTour`,
      'Favorites',
      `${verb} a saved tour`,
      success,
      {
        security: auth,
        parameters: [parameter('tourId', 'path', identifier)],
        responses: errors(401, 404),
        description: 'Idempotent. Removing an absent favorite succeeds.',
      },
    ),
  );
}
add(
  '/api/v1/tours',
  'get',
  operation(
    'listTours',
    'Tours',
    'Browse tours',
    {
      ...envelope({ data: { type: 'array', items: reference('Tour') } }),
      properties: {
        ...envelope({ data: { type: 'array', items: reference('Tour') } })
          .properties,
        results: { type: 'integer' },
      },
    },
    {
      parameters: [
        parameter('page', 'query', { type: 'integer', default: 1 }, false),
        parameter('limit', 'query', { type: 'integer', default: 100 }, false),
        parameter('sort', 'query', text, false),
        parameter(
          'difficulty',
          'query',
          { type: 'string', enum: ['easy', 'medium', 'difficult'] },
          false,
        ),
        parameter('fields', 'query', text, false),
      ],
      description:
        'Comma-separated sort fields; prefix a field with - for descending order. Field selection changes the response shape. Page must be from 1 to 10000; limit must be from 1 to 100. Invalid values return 400.',
    },
  ),
);
add(
  '/api/v1/tours/{id}',
  'get',
  operation(
    'getTour',
    'Tours',
    'Read a tour',
    envelope({ data: reference('Tour') }),
    {
      parameters: [parameter('id', 'path', identifier)],
      responses: errors(404),
    },
  ),
);
add(
  '/api/v1/bookings',
  'post',
  operation(
    'createBooking',
    'Bookings',
    'Create an unpaid booking request',
    bookingResponse,
    {
      security: auth,
      requestBody: body(
        object(
          {
            tourId: identifier,
            departureDate: date,
            guests: { type: 'integer', minimum: 1 },
            requestId: {
              type: 'string',
              format: 'uuid',
              pattern:
                '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-4[a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$',
            },
          },
          ['tourId', 'departureDate', 'guests', 'requestId'],
        ),
      ),
      description:
        'Use a fresh UUID v4 requestId per intended booking. Identical retries return 200; a new booking returns 201. Reusing the key with different details returns 409. Dates must be after today UTC and offered by the tour when startDates exist. Guests cannot exceed MaxGroupSize. Server owns user, price, status, and payment fields. Creation alone does not reserve seats.',
      responses: {
        201: response('Created', bookingResponse),
        ...errors(401, 404, 409),
      },
    },
  ),
);
add(
  '/api/v1/bookings/mine',
  'get',
  operation(
    'myBookings',
    'Bookings',
    'List only the current customer’s bookings',
    {
      ...envelope({
        bookings: { type: 'array', items: reference('Booking'), maxItems: 12 },
      }),
      properties: {
        ...envelope({
          bookings: {
            type: 'array',
            items: reference('Booking'),
            maxItems: 12,
          },
        }).properties,
        hasMore: { type: 'boolean' },
      },
    },
    {
      security: auth,
      parameters: [
        parameter(
          'page',
          'query',
          { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
          false,
        ),
      ],
      responses: errors(401, 503),
      description:
        'Newest first; fixed page size 12. Lazily expires unpaid, unprotected holds. Cache-Control: no-store.',
    },
  ),
);
for (const [suffix, method, operationId, summary] of [
  [
    'cancel',
    'patch',
    'cancelBooking',
    'Cancel an unpaid future request and release its hold',
  ],
  [
    'hold',
    'post',
    'holdSeats',
    'Acquire an unpaid seat hold for up to 15 minutes',
  ],
  ['hold', 'delete', 'releaseSeats', 'Release a temporary hold'],
]) {
  add(
    `/api/v1/bookings/{id}/${suffix}`,
    method,
    operation(operationId, 'Bookings', summary, bookingResponse, {
      security: auth,
      parameters: [parameter('id', 'path', identifier)],
      responses: errors(401, 404, 409, 503),
      description:
        'Owner-only. Requires transaction-capable MongoDB. Checkout-locked bookings cannot be changed here. Paid/departed requests cannot be cancelled. Holding requires a published, open departure with enough capacity; retrying an active hold does not extend it.',
    }),
  );
}
add(
  '/api/v1/departures',
  'get',
  operation(
    'listDepartures',
    'Inventory',
    'List upcoming departure availability',
    envelope({
      departures: {
        type: 'array',
        maxItems: 60,
        items: reference('Departure'),
      },
    }),
    {
      parameters: [parameter('tourId', 'query', identifier)],
      responses: errors(404, 503),
      description:
        'Next 60 future UTC dates in ascending order. Availability is a snapshot, not a reservation. Closed departures expose zero available seats.',
    },
  ),
);
add(
  '/api/v1/departures',
  'put',
  operation(
    'configureDeparture',
    'Inventory',
    'Create or configure departure capacity (admin)',
    envelope({ departure: reference('Departure') }),
    {
      security: auth,
      requestBody: body(
        object(
          {
            tourId: identifier,
            date,
            capacity: { type: 'integer', minimum: 1, maximum: 1000 },
            closed: { type: 'boolean' },
          },
          ['tourId', 'date', 'capacity'],
        ),
      ),
      description:
        'Admin role required. Future valid UTC date, offered by the tour when startDates exist. Capacity cannot be reduced below reserved seats. Omitting closed preserves its existing value (false on creation).',
      responses: errors(401, 403, 404, 409, 503),
    },
  ),
);
add(
  '/api/v1/payments/status',
  'get',
  operation(
    'paymentStatus',
    'Test payments',
    'Check whether test checkout is configured',
    envelope({
      enabled: { type: 'boolean' },
      mode: { type: 'string', enum: ['test'] },
    }),
    {
      description:
        'Configuration presence only, not a Stripe connectivity or account eligibility check. Live keys are blocked. Cache-Control: no-store.',
    },
  ),
);
for (const cancel of [false, true]) {
  add(
    `/api/v1/bookings/{id}/checkout${cancel ? '/cancel' : ''}`,
    'post',
    operation(
      cancel ? 'cancelCheckout' : 'startCheckout',
      'Test payments',
      cancel
        ? 'Verify and cancel checkout'
        : 'Start or resume Stripe test checkout',
      cancel ? success : envelope({ url: { type: 'string', format: 'uri' } }),
      {
        security: auth,
        parameters: [parameter('id', 'path', identifier)],
        responses: errors(401, 404, 409, 503),
        description: cancel
          ? 'Seats remain protected until the provider confirms expiry; payment winning a cancellation race returns 409 instead of releasing paid seats.'
          : 'Requires owner’s active unpaid hold and configured test keys. Returns a hosted checkout.stripe.com URL. Protects allocation while provider outcome is uncertain. A browser return never proves payment. Real hosted sandbox verification is pending.',
      },
    ),
  );
}
add(
  '/api/v1/payments/webhook',
  'post',
  operation(
    'stripeWebhook',
    'Test payments',
    'Receive signed Stripe test events (provider only)',
    object({ received: { type: 'boolean' } }),
    {
      parameters: [parameter('Stripe-Signature', 'header', text)],
      requestBody: body({ type: 'object', additionalProperties: true }),
      description:
        'Requires the exact raw application/json bytes (128kb maximum) and a valid Stripe signature; a JWT cannot authorize this endpoint. Re-serializing signed JSON invalidates the signature. Processes test checkout completed, async payment succeeded, and expired events idempotently; ignores unsupported events. Provider failures return 503 for redelivery. Not a client payment-confirmation API.',
      responses: errors(503),
    },
  ),
);

add(
  '/api/v1/admin/tours',
  'get',
  operation(
    'adminTourCatalog',
    'Administration',
    'List published and hidden tours (admin)',
    {
      ...envelope({
        tours: { type: 'array', maxItems: 25, items: reference('Tour') },
      }),
      properties: {
        ...envelope({
          tours: { type: 'array', maxItems: 25, items: reference('Tour') },
        }).properties,
        hasMore: { type: 'boolean' },
      },
    },
    {
      security: auth,
      parameters: [
        parameter(
          'page',
          'query',
          { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
          false,
        ),
      ],
      description:
        'Administrator only; Cache-Control: no-store. Fixed page size 25. Other query parameters are rejected. Returns metadata needed by the admin studio; never provisions an administrator account.',
      responses: errors(401, 403),
    },
  ),
);

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Planit core API',
    version: '1.0.0',
    description:
      'Core customer API and departure administration. Partial contract: legacy places, drivers, search, reviews, tour mutations/statistics, user administration/profile mutations, and admin booking reads are not yet covered. Documentation does not add runtime validation. Stripe hosted sandbox verification is pending; live payments are disabled. Most /api routes share a 100-request/hour IP limit; payment status and webhook routes bypass it.',
  },
  servers: [
    {
      url: '/',
      description:
        'Same origin as this document; paths include /api/v1 where applicable.',
    },
  ],
  tags: [
    'Operations',
    'Accounts',
    'Favorites',
    'Tours',
    'Bookings',
    'Inventory',
    'Test payments',
    'Administration',
  ].map((name) => ({ name })),
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'jwt',
        description:
          'HttpOnly SameSite=Strict cookie set by login/signup. Secure in production. Browser clients use same-origin cookies.',
      },
    },
    responses: Object.fromEntries(
      [400, 401, 403, 404, 409, 429, 500, 503].map((code) => [
        `Error${code}`,
        response(
          {
            400: 'Invalid input or signature',
            401: 'Authentication required or invalid',
            403: 'Role forbidden',
            404: 'Resource not found or not owned',
            409: 'State conflict or insufficient capacity',
            429: 'Rate limit exceeded (global limiter may return plain text)',
            500: 'Unexpected server error',
            503: 'Required service unavailable; retry safely',
          }[code],
          reference('Error'),
        ),
      ]),
    ),
    schemas: {
      Error: object(
        {
          status: { type: 'string', enum: ['fail', 'error'] },
          message: text,
          requestId: text,
        },
        ['status', 'message'],
      ),
      User: object({
        _id: identifier,
        name: text,
        email,
        photo: text,
        role: {
          type: 'string',
          enum: ['user', 'guide', 'lead-guide', 'admin'],
        },
      }),
      AuthResponse: {
        ...envelope({ user: reference('User') }),
        properties: {
          ...envelope({ user: reference('User') }).properties,
          token: text,
        },
      },
      Tour: object({
        _id: identifier,
        name: text,
        summary: text,
        description: text,
        price: { type: 'number' },
        duration: { type: 'number' },
        MaxGroupSize: { type: 'number' },
        difficulty: { type: 'string', enum: ['easy', 'medium', 'difficult'] },
        imageCover: text,
        images: { type: 'array', items: text },
        startDates: { type: 'array', items: timestamp },
      }),
      Booking: object({
        _id: identifier,
        tourName: text,
        departureDate: timestamp,
        guests: { type: 'integer' },
        unitPrice: { type: 'number' },
        price: {
          type: 'number',
          description: 'Total major currency units, not cents.',
        },
        currency: { type: 'string', enum: ['USD'] },
        status: { type: 'string', enum: ['pending', 'cancelled', 'confirmed'] },
        paid: { type: 'boolean' },
        createdAt: timestamp,
        cancelledAt: timestamp,
        holdStatus: {
          type: 'string',
          enum: ['none', 'held', 'expired', 'released', 'confirmed'],
        },
        holdExpiresAt: timestamp,
        checkoutLocked: { type: 'boolean' },
        paymentStatus: {
          type: 'string',
          enum: ['unpaid', 'checkout', 'paid', 'refund_pending', 'refunded'],
        },
      }),
      Departure: object({
        _id: identifier,
        date: timestamp,
        capacity: { type: 'integer', minimum: 1, maximum: 1000 },
        availableSeats: { type: 'integer', minimum: 0 },
        closed: { type: 'boolean' },
      }),
    },
  },
};
