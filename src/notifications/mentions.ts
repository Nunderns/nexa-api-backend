import { MAX_MENTIONS_PER_CONTENT } from './notifications.constants';

/**
 * `@username` where username follows the registration rule
 * (`RegisterDto`: 3 to 30 of `[A-Za-z0-9_]`).
 *
 * - The lookbehind skips e-mail addresses (`ana@example.com`) and `@@name`.
 * - The lookahead rejects a handle that runs past 30 characters instead of
 *   silently truncating it into a different, possibly existing, username.
 *
 * Both quantifiers are bounded, so the scan is linear in the input length.
 */
const MENTION_PATTERN =
  /(?<![A-Za-z0-9_@])@([A-Za-z0-9_]{3,30})(?![A-Za-z0-9_])/g;

/**
 * Distinct usernames mentioned in the given texts, in order of first
 * appearance, capped at `MAX_MENTIONS_PER_CONTENT`.
 *
 * Usernames are matched exactly, as stored: the `users.username` unique index
 * is case sensitive, so `@Ana` and `@ana` can be two different people.
 */
export function extractMentions(
  ...texts: (string | null | undefined)[]
): string[] {
  const found = new Set<string>();

  for (const text of texts) {
    if (!text) {
      continue;
    }

    for (const match of text.matchAll(MENTION_PATTERN)) {
      found.add(match[1]);

      if (found.size === MAX_MENTIONS_PER_CONTENT) {
        return [...found];
      }
    }
  }

  return [...found];
}
