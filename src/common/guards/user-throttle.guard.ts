import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import {
  USER_RATE_LIMIT,
  USER_THROTTLER_NAME,
} from '../config/rate-limit.config';

/**
 * Rate limiter keyed on the authenticated user instead of the client IP.
 *
 * The global `ThrottlerGuard` keys on the IP address, which is the right
 * default for anonymous traffic but a poor fit for authenticated endpoints:
 * everyone behind the same NAT, office or mobile carrier shares one budget and
 * can lock each other out, while an attacker rotating IPs gets a fresh budget
 * on every request. Keying a second budget on the account closes both gaps.
 *
 * It enforces only the `user` throttler, leaving the `default` (per-IP)
 * throttler to the global guard, so the two budgets are independent and each
 * can carry the limit that suits what it measures: routes typically allow
 * more requests per IP than per user.
 *
 * Applied after `JwtAuthGuard`, so the request already carries `user`.
 * Unauthenticated requests fall back to the parent IP based tracker, which
 * keeps the guard safe if it is ever mounted ahead of the authentication
 * guard.
 */
@Injectable()
export class UserThrottleGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  async onModuleInit(): Promise<void> {
    await super.onModuleInit();

    // Whatever the module registered, this guard only cares about the
    // per-user bucket.
    this.throttlers = [
      {
        name: USER_THROTTLER_NAME,
        limit: USER_RATE_LIMIT.limit,
        ttl: USER_RATE_LIMIT.ttl,
      },
    ];
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const user = (req as { user?: { id?: unknown } }).user;

    if (typeof user?.id === 'number') {
      return Promise.resolve(`user:${user.id}`);
    }

    return super.getTracker(req);
  }
}
