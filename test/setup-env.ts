/**
 * The app refuses to boot without these (see env.validation.ts). E2E suites
 * replace Prisma with fakes, so placeholder values are enough; real ones from
 * the shell or .env win.
 */
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/nexa_test';
process.env.JWT_SECRET ??= 'e2e-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret';
