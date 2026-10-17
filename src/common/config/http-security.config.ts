/**
 * HTTP hardening settings, read from the environment at call time so tests
 * can change them per suite.
 */

/** Vite's dev server, used when FRONTEND_URL is unset outside production. */
const DEV_FRONTEND_URL = 'http://localhost:5173';

/** Express' own default, made explicit. Uploads go through multer instead. */
const DEFAULT_BODY_LIMIT = '100kb';

/**
 * Origins allowed by CORS. FRONTEND_URL may hold several comma-separated
 * origins (e.g. the site and a preview deployment). Env validation makes it
 * mandatory in production.
 */
export function allowedOrigins(): string[] {
  const raw = process.env.FRONTEND_URL?.trim() || DEV_FRONTEND_URL;

  return raw
    .split(',')
    .map((origin) => stripTrailingSlashes(origin.trim()))
    .filter(Boolean);
}

/** Linear-time stand-in for `.replace(/\/+$/, '')`, which backtracks. */
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end--;
  return value.slice(0, end);
}

/** Max size of JSON and urlencoded bodies, in body-parser syntax. */
export function bodyLimit(): string {
  return process.env.BODY_LIMIT?.trim() || DEFAULT_BODY_LIMIT;
}

/** Swagger exposes the whole API surface, so it is only served off production. */
export function isSwaggerEnabled(): boolean {
  return process.env.NODE_ENV !== 'production';
}
