/**
 * The popular timeline (`GET /posts/popular`), modelled on Reddit's r/popular.
 *
 * Only public, non-NSFW communities feed it: it is a discovery surface shown to
 * everyone, so a private community's posts never appear here even for its own
 * members (they still see them on their home feed and in the community).
 *
 * The country filter is about the *audience*, not the author: "popular in
 * Brazil" means posts that people in Brazil are reading, taken from the
 * per-country view rollup (`post_view_stats`). Posts carry no country of their
 * own. A view is only attributed to a country when an edge proxy sends
 * `x-country-code`, so without one every view is `XX` and every country filter
 * is empty.
 */

export const POPULAR_SORTS = ['hot', 'new', 'top', 'rising'] as const;
export type PopularSort = (typeof POPULAR_SORTS)[number];

/** Rolling windows for `top`, counted back from now. */
export const POPULAR_TIME_WINDOWS = [
  'hour',
  'day',
  'week',
  'month',
  'year',
  'all',
] as const;
export type PopularTimeWindow = (typeof POPULAR_TIME_WINDOWS)[number];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const POPULAR_TIME_WINDOW_MS: Record<PopularTimeWindow, number | null> =
  {
    hour: HOUR_MS,
    day: DAY_MS,
    week: 7 * DAY_MS,
    month: 30 * DAY_MS,
    year: 365 * DAY_MS,
    all: null,
  };

/**
 * Countries offered by the filter: Reddit's r/popular list plus Brazil.
 * Anything else is rejected rather than silently returning an empty page, so a
 * typo in a shared link shows up as an error.
 */
export const POPULAR_GEO_COUNTRIES = [
  'US',
  'AR',
  'AU',
  'BR',
  'BG',
  'CA',
  'CL',
  'CO',
  'HR',
  'CZ',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IS',
  'IN',
  'IE',
  'IT',
  'JP',
  'MY',
  'MX',
  'NZ',
  'PH',
  'PL',
  'PT',
  'PR',
  'RO',
  'RS',
  'SG',
  'ES',
  'SE',
  'TW',
  'TH',
  'TR',
  'GB',
] as const;

/**
 * Seconds of age worth one order of magnitude of score in `hot`, Reddit's
 * constant: a post needs 10x the score to outrank one 12.5 hours newer.
 */
export const HOT_DECAY_SECONDS = 45_000;

/** `rising` only considers posts younger than this. */
export const RISING_MAX_AGE_MS = DAY_MS;

/**
 * `rising` ranks by views in the most recent hourly buckets. Three hours keeps
 * the current, still-filling bucket from dominating on its own.
 */
export const RISING_VIEW_WINDOW_HOURS = 3;
