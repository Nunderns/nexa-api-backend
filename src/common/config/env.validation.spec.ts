import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const valid = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_SECRET: 'access-secret-value',
    JWT_REFRESH_SECRET: 'refresh-secret-value',
  };
  const longSecret = (seed: string) => seed.repeat(32).slice(0, 32);

  it('accepts a complete development config and defaults NODE_ENV', () => {
    expect(validateEnv(valid)).toMatchObject({
      ...valid,
      NODE_ENV: 'development',
    });
  });

  it('keeps variables outside the schema', () => {
    expect(validateEnv({ ...valid, PORT: '4000' })).toMatchObject({
      PORT: '4000',
    });
  });

  it.each(['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'])(
    'rejects a missing %s',
    (key) => {
      const config: Record<string, unknown> = { ...valid };
      delete config[key];

      expect(() => validateEnv(config)).toThrow(key);
    },
  );

  it.each(['', '   '])('rejects a blank JWT_SECRET (%p)', (value) => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: value })).toThrow(
      'JWT_SECRET',
    );
  });

  it('rejects short secrets in production', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow(
      /at least 32 characters/,
    );
  });

  it('rejects identical secrets in production', () => {
    const shared = longSecret('a');

    expect(() =>
      validateEnv({
        ...valid,
        NODE_ENV: 'production',
        JWT_SECRET: shared,
        JWT_REFRESH_SECRET: shared,
      }),
    ).toThrow(/must differ from JWT_SECRET/);
  });

  it('accepts strong, distinct secrets in production', () => {
    expect(() =>
      validateEnv({
        ...valid,
        NODE_ENV: 'production',
        JWT_SECRET: longSecret('a'),
        JWT_REFRESH_SECRET: longSecret('b'),
      }),
    ).not.toThrow();
  });

  it('never echoes secret values in the error', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).not.toThrow(
      valid.JWT_SECRET,
    );
  });
});
