/**
 * Post insights: reach and engagement analytics for a single post.
 *
 * The feature has three write/read paths that must stay consistent with each
 * other, which is why they live in one module:
 *
 *   1. `recordView`  appends a raw `PostView`, bumps `Post.viewCount` and
 *      increments the hourly `PostViewStat` bucket, in one transaction.
 *   2. `getInsights` reads the rollup only, never the raw table.
 *   3. the engagement counters are the ones the rest of the API already
 *      maintains (`Post.upvoteCount`, `Post.commentCount`, ...), so they are
 *      read straight off the post row rather than re-derived.
 *
 * The raw table is what makes the deduplication window auditable; the rollup
 * is what makes the chart cheap. Neither is derivable from the other.
 */

/** Hours of history the chart shows, matching the first-48-hours readout. */
export const INSIGHTS_CHART_HOURS = 48;

/**
 * A repeat visit by the same viewer inside this window is not counted again.
 *
 * Refreshing a post should not inflate its own numbers, but the window cannot
 * be zero: without it every poll counts, and with it set too high a genuine
 * second visit goes missing. 30 minutes is long enough to absorb a refresh or
 * a back-navigation and short enough that a reader returning later still
 * counts.
 */
export const VIEW_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

/** Countries listed individually before the remainder is folded into "other". */
export const INSIGHTS_TOP_COUNTRIES = 3;

/** Sentinel used when the visitor's country cannot be determined. */
export const UNKNOWN_COUNTRY = 'XX';

/**
 * Engagement counters that are not votes or comments.
 *
 * `shares`, `reposts` and `awards` have no write path of their own yet. They
 * are read here so the engagement block is complete, and they are documented
 * here rather than silently hard-coded in the service so that whoever adds the
 * matching write endpoint knows exactly which counters are wired up.
 */
export const POST_ENGAGEMENT_COUNTERS = [
  'shareCount',
  'repostCount',
  'awardCount',
] as const;
