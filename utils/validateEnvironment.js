module.exports = (environment) => {
  const fail = (message) => {
    throw new Error(message);
  };
  if (
    environment.NODE_ENV &&
    !['development', 'test', 'production'].includes(environment.NODE_ENV)
  )
    fail('NODE_ENV must be development, test, or production.');
  if (!environment.JWT_SECRET || environment.JWT_SECRET.length < 32)
    fail('JWT_SECRET must contain at least 32 characters.');
  const production = environment.NODE_ENV === 'production';
  const database = production
    ? environment.DATABASE
    : environment.DATABASE_LOCAL || environment.DATABASE;
  if (!database || !/^mongodb(?:\+srv)?:\/\//.test(database))
    fail(
      'Set a valid MongoDB DATABASE connection string (DATABASE_LOCAL is supported outside production).',
    );
  if (production && environment.DATABASE_LOCAL)
    fail(
      'Remove DATABASE_LOCAL in production to avoid selecting a development database.',
    );
  if (
    environment.PORT &&
    (!/^\d+$/.test(environment.PORT) ||
      Number(environment.PORT) < 1 ||
      Number(environment.PORT) > 65535)
  )
    fail('PORT must be an integer from 1 to 65535.');
  if (production) {
    let origin;
    try {
      origin = new URL(environment.PUBLIC_APP_URL);
    } catch {
      fail('PUBLIC_APP_URL must be an HTTPS origin in production.');
    }
    if (
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    )
      fail(
        'PUBLIC_APP_URL must be a credential-free HTTPS origin, without a path, query, or fragment.',
      );
    if (!environment.EMAIL_FROM)
      fail('Configure EMAIL_HOST and EMAIL_FROM before production startup.');
    if (!environment.EMAIL_HOST) {
      if (!environment.SENDGRID_USERNAME || !environment.SENDGRID_PASSWORD)
        fail(
          'Configure EMAIL_HOST for SMTP or both legacy SendGrid credentials.',
        );
      return { database };
    }
    if (!['true', 'false'].includes(environment.EMAIL_SECURE))
      fail('Set EMAIL_SECURE explicitly to true or false.');
    if (
      Boolean(environment.EMAIL_USERNAME) !==
      Boolean(environment.EMAIL_PASSWORD)
    )
      fail(
        'Configure both EMAIL_USERNAME and EMAIL_PASSWORD, or neither for a trusted relay.',
      );
    if (
      !environment.EMAIL_PORT ||
      !/^\d+$/.test(environment.EMAIL_PORT) ||
      Number(environment.EMAIL_PORT) < 1 ||
      Number(environment.EMAIL_PORT) > 65535
    )
      fail('EMAIL_PORT must be an integer from 1 to 65535.');
  }
  return { database };
};
