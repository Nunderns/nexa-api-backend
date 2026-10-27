/** More terms than this add cost without making results more relevant. */
const MAX_TERMS = 10;

/**
 * Turns free text into a `to_tsquery` expression: every word must match, and
 * the last one may be a prefix so results appear while a word is still being
 * typed ("rea" finds "react").
 *
 * Only letters and digits survive, so no user input can reach the tsquery
 * syntax (`&`, `|`, `!`, `:`, parentheses). Returns null when nothing
 * searchable is left.
 */
export function toPrefixTsQuery(input: string): string | null {
  const terms = input
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, MAX_TERMS);

  if (terms.length === 0) {
    return null;
  }

  return `${terms.join(' & ')}:*`;
}
