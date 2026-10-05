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
 * Budget for password reset endpoints. These are strictly limited because they
 * involve sending emails and code verification. Deliberately very tight to
 * prevent email spam and code brute-forcing.
 */
export const PASSWORD_RESET_RATE_LIMIT = {
  limit: positiveInt(process.env.PASSWORD_RESET_RATE_LIMIT_MAX, 3),
  ttl: positiveInt(process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS, 60_000),
};

/**
 * Budget for password reset code verification. Even tighter to prevent
 * brute-forcing the 6-digit code.
 */
export const VERIFY_RESET_CODE_RATE_LIMIT = {
  limit: positiveInt(process.env.VERIFY_RESET_CODE_RATE_LIMIT_MAX, 5),
  ttl: positiveInt(process.env.VERIFY_RESET_CODE_RATE_LIMIT_WINDOW_MS, 60_000),
};

/**
 * Name of the throttler that `UserThrottleGuard` enforces. Keeping it separate
 * from `default` is what allows the two budgets to differ: the global guard
 * keys `default` on the IP, this one keys `user` on the account, and each can
 * therefore have a limit suited to what it is actually measuring.
 */
export const USER_THROTTLER_NAME = 'user';

/**
 * Fallback budget for `UserThrottleGuard` on routes that do not declare their
 * own per-user limit. Deliberately looser than the per-IP budget: it exists to
 * stop a single account from hammering the API, not to ration a shared
 * connection.
 */
export const USER_RATE_LIMIT = {
  limit: positiveInt(process.env.USER_RATE_LIMIT_MAX, 200),
  ttl: positiveInt(process.env.USER_RATE_LIMIT_WINDOW_MS, 60_000),
};

/**
 * Per-IP budget for opening a one-to-one chat.
 *
 * A conversation is cheap to create but is a durable object that shows up in
 * the target user's inbox, so the abuse to stop is fan-out spam (one user
 * opening hundreds of chats to reach strangers), not bandwidth. Kept looser
 * than the per-user budget because everyone behind one NAT or corporate proxy
 * shares this counter.
 */
export const CHAT_CREATE_IP_RATE_LIMIT = {
  limit: positiveInt(process.env.CHAT_CREATE_IP_RATE_LIMIT_MAX, 30),
  ttl: positiveInt(process.env.CHAT_CREATE_IP_RATE_LIMIT_WINDOW_MS, 60_000),
};

/** Per-user budget for opening a one-to-one chat. */
export const CHAT_CREATE_RATE_LIMIT = {
  limit: positiveInt(process.env.CHAT_CREATE_RATE_LIMIT_MAX, 10),
  ttl: positiveInt(process.env.CHAT_CREATE_RATE_LIMIT_WINDOW_MS, 60_000),
};

/**
 * Per-IP budget for sending messages. Looser than the per-user budget so a
 * shared IP does not lock out a whole team; the per-user budget is what
 * actually stops inbox flooding.
 */
export const CHAT_MESSAGE_IP_RATE_LIMIT = {
  limit: positiveInt(process.env.CHAT_MESSAGE_IP_RATE_LIMIT_MAX, 60),
  ttl: positiveInt(process.env.CHAT_MESSAGE_IP_RATE_LIMIT_WINDOW_MS, 60_000),
};

/**
 * Per-user budget for sending messages, deliberately the tightest
 * authenticated budget in the API. Message sending is the highest frequency
 * write path here and the cheapest to abuse for flooding someone's inbox or
 * burning database writes. Keyed on the account, so rotating IPs does not
 * reset it.
 */
export const CHAT_MESSAGE_RATE_LIMIT = {
  limit: positiveInt(process.env.CHAT_MESSAGE_RATE_LIMIT_MAX, 20),
  ttl: positiveInt(process.env.CHAT_MESSAGE_RATE_LIMIT_WINDOW_MS, 60_000),
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
