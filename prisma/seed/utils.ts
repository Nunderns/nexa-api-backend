import { createHash } from 'node:crypto';

/**
 * Small deterministic PRNG (mulberry32) so generated votes are identical on
 * every run and the development dataset stays predictable.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable numeric seed derived from a string key. */
export function seedFromString(value: string): number {
  return createHash('sha256').update(value).digest().readUInt32BE(0);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const HOUR_MS = 60 * 60 * 1000;

export function hoursAgo(hours: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - hours * HOUR_MS);
}

export function hoursAfter(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}
