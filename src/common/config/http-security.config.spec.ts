import {
  allowedOrigins,
  bodyLimit,
  isSwaggerEnabled,
} from './http-security.config';

describe('http-security.config', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  describe('allowedOrigins', () => {
    it('falls back to the Vite dev server', () => {
      delete process.env.FRONTEND_URL;
      expect(allowedOrigins()).toEqual(['http://localhost:5173']);
    });

    it('splits a list and strips trailing slashes and blanks', () => {
      process.env.FRONTEND_URL =
        ' https://nexa.app/ , https://preview.nexa.app//,, ';
      expect(allowedOrigins()).toEqual([
        'https://nexa.app',
        'https://preview.nexa.app',
      ]);
    });
  });

  describe('bodyLimit', () => {
    it('defaults to 100kb', () => {
      delete process.env.BODY_LIMIT;
      expect(bodyLimit()).toBe('100kb');
    });

    it('reads BODY_LIMIT', () => {
      process.env.BODY_LIMIT = ' 1mb ';
      expect(bodyLimit()).toBe('1mb');
    });
  });

  it('serves Swagger everywhere but production', () => {
    process.env.NODE_ENV = 'development';
    expect(isSwaggerEnabled()).toBe(true);
    process.env.NODE_ENV = 'production';
    expect(isSwaggerEnabled()).toBe(false);
  });
});
