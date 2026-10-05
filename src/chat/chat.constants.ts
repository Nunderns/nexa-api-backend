/**
 * Chat feature limits.
 *
 * These are deliberately centralized: the same numbers are enforced by the
 * DTO validation layer, by the database column width and by the rate limiter,
 * and the three must not drift apart.
 */

/**
 * Maximum message length, in characters. Must match the `content` column
 * width (`@db.VarChar(2000)`) in the Prisma schema: the DTO rejects anything
 * longer with a 400, and the database refuses to store it even if some other
 * code path bypasses the DTO.
 */
export const MESSAGE_MAX_LENGTH = 2000;

/** Minimum message length, after trimming. */
export const MESSAGE_MIN_LENGTH = 1;
