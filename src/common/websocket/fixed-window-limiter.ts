interface Window {
  count: number;
  resetAt: number;
}

/**
 * In-memory fixed-window counter, for traffic the HTTP throttler never sees
 * (WebSocket handshakes go through Socket.IO, not the Nest router).
 *
 * Per process, like the default throttler storage: with several instances
 * each one enforces its own budget. Expired windows are swept periodically,
 * so the map cannot grow with every IP that ever connected.
 */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, Window>();
  private nextSweepAt = 0;

  constructor(
    private readonly options: { limit: number; ttl: number },
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts a hit for `key`; `false` once the window's budget is spent. */
  hit(key: string): boolean {
    const now = this.now();
    this.sweep(now);

    const window = this.windows.get(key);

    if (!window || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.options.ttl });
      return true;
    }

    window.count++;
    return window.count <= this.options.limit;
  }

  get size(): number {
    return this.windows.size;
  }

  private sweep(now: number): void {
    if (now < this.nextSweepAt) {
      return;
    }

    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) {
        this.windows.delete(key);
      }
    }

    this.nextSweepAt = now + this.options.ttl;
  }
}
