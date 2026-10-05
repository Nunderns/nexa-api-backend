/**
 * Rate limit configuration.
 *
 * Limits are read from the environment so they can be tuned on a running
 * environment without a rebuild. Every value is a *per IP* budget.
 *
 * `ttl` values are in milliseconds (@nestjs/throttler v6 semantics).
 */

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Generic budget applied to every route, e.g. browsing posts. */
export const GLOBAL_RATE_LIMIT = {
  limit: positiveInt(process.env.RATE_LIMIT_MAX, 100),
  ttl: positiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
};

/**
 * Budget for credential endpoints, where the abuse we care about is brute
 * force and account stuffing rather than bandwidth. Deliberately tight: a
 * legitimate user rarely fails to log in 5 times a minute.
 */
export const AUTH_RATE_LIMIT = {
  limit: positiveInt(process.env.AUTH_RATE_LIMIT_MAX, 5),
  ttl: positiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 60_000),
};

/** Budget for uploads, which are the most expensive endpoints in terms of I/O. */
export const MEDIA_RATE_LIMIT = {
  limit: positiveInt(process.env.MEDIA_RATE_LIMIT_MAX, 10),
  ttl: positiveInt(process.env.MEDIA_RATE_LIMIT_WINDOW_MS, 60_000),
};

/**
 * Number of reverse proxy hops in front of the app, used for `trust proxy`.
 *
 * The rate limiter keys on the client IP, so this must match the real
 * topology: too low and the limiter bypasses the proxy's own forwarded
 * header (a client can forge `X-Forwarded-For`); too high and every client
 * is seen through the proxy, so a handful of users lock each other out.
 * `1` is the common single Nginx / platform-load-balancer setup.
 */
export const TRUST_PROXY_HOPS = positiveInt(process.env.TRUST_PROXY_HOPS, 1);
