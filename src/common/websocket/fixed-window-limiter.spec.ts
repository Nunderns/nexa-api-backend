import { FixedWindowLimiter } from './fixed-window-limiter';

describe('FixedWindowLimiter', () => {
  let now = 0;
  const clock = () => now;

  beforeEach(() => {
    now = 1_000;
  });

  it('allows up to the limit within a window, per key', () => {
    const limiter = new FixedWindowLimiter({ limit: 2, ttl: 1_000 }, clock);

    expect(limiter.hit('a')).toBe(true);
    expect(limiter.hit('a')).toBe(true);
    expect(limiter.hit('a')).toBe(false);
    expect(limiter.hit('b')).toBe(true);
  });

  it('resets once the window expires', () => {
    const limiter = new FixedWindowLimiter({ limit: 1, ttl: 1_000 }, clock);

    expect(limiter.hit('a')).toBe(true);
    expect(limiter.hit('a')).toBe(false);

    now += 1_000;
    expect(limiter.hit('a')).toBe(true);
  });

  it('sweeps expired keys so memory does not grow without bound', () => {
    const limiter = new FixedWindowLimiter({ limit: 1, ttl: 1_000 }, clock);

    for (let i = 0; i < 100; i++) {
      limiter.hit(`ip-${i}`);
    }
    expect(limiter.size).toBe(100);

    now += 2_000;
    limiter.hit('fresh');
    expect(limiter.size).toBe(1);
  });
});
