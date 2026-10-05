import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { UserThrottleGuard } from './user-throttle.guard';
import { USER_THROTTLER_NAME } from '../config/rate-limit.config';

// `ThrottlerGuard` looks the route override up under `<constant><name>`;
// the constants are not part of the package's public exports, so they are
// spelled out here the same way the library does internally.
const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
const THROTTLER_TTL = 'THROTTLER:TTL';

describe('UserThrottleGuard', () => {
  const options: ThrottlerModuleOptions = {
    errorMessage: 'Too Many Requests',
    throttlers: [{ name: 'default', limit: 100, ttl: 60_000 }],
  };

  const buildContext = (req: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({ header: jest.fn() }),
      }),
      getClass: () => class TestController {},
      getHandler: () => function handler() {},
    }) as unknown as ExecutionContext;

  const buildGuard = (
    storage: ThrottlerStorage,
    metadata: Record<string, unknown> = {},
  ): UserThrottleGuard =>
    new UserThrottleGuard(options, storage, {
      getAllAndOverride: (key: string) => metadata[key] as never,
    } as never as Reflector);

  const buildGuardAndInit = async (
    storage: ThrottlerStorage,
    metadata: Record<string, unknown> = {},
  ) => {
    const guard = buildGuard(storage, metadata);
    await guard.onModuleInit();

    return guard;
  };

  it('should only enforce the per user bucket', async () => {
    const increment = jest
      .fn()
      .mockResolvedValue({ totalHits: 1, isBlocked: false });
    const guard = await buildGuardAndInit({ increment });

    await guard.canActivate(buildContext({ user: { id: 1 }, ip: '1.1.1.1' }));

    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment.mock.calls[0][4]).toBe(USER_THROTTLER_NAME);
  });

  it('should read the limit from the route metadata', async () => {
    const increment = jest
      .fn()
      .mockResolvedValue({ totalHits: 1, isBlocked: false });
    const guard = await buildGuardAndInit(
      { increment },
      {
        [THROTTLER_LIMIT + USER_THROTTLER_NAME]: 7,
        [THROTTLER_TTL + USER_THROTTLER_NAME]: 30_000,
      },
    );

    await guard.canActivate(buildContext({ user: { id: 1 }, ip: '1.1.1.1' }));

    const [, , limit, ,] = increment.mock.calls[0] as [
      string,
      number,
      number,
      number,
      string,
    ];

    expect(limit).toBe(7);
  });

  // The tracker string is hashed by `ThrottlerGuard.generateKey`, so the
  // assertions compare keys rather than their content: identical requests
  // must share a key, different identities must not.
  it('should ignore the ip once the request is authenticated', async () => {
    const increment = jest
      .fn()
      .mockResolvedValue({ totalHits: 1, isBlocked: false });
    const guard = await buildGuardAndInit({ increment });

    await guard.canActivate(buildContext({ user: { id: 42 }, ip: '1.1.1.1' }));
    await guard.canActivate(buildContext({ user: { id: 42 }, ip: '9.9.9.9' }));

    expect(increment).toHaveBeenCalledTimes(2);
    expect(increment.mock.calls[0][0]).toBe(increment.mock.calls[1][0]);
  });

  it('should give two users behind the same IP separate budgets', async () => {
    const increment = jest
      .fn()
      .mockResolvedValue({ totalHits: 1, isBlocked: false });
    const guard = await buildGuardAndInit({ increment });

    await guard.canActivate(buildContext({ user: { id: 1 }, ip: '1.1.1.1' }));
    await guard.canActivate(buildContext({ user: { id: 2 }, ip: '1.1.1.1' }));

    expect(increment.mock.calls[0][0]).not.toBe(increment.mock.calls[1][0]);
  });

  it('should key on the ip when the request is not authenticated', async () => {
    const increment = jest
      .fn()
      .mockResolvedValue({ totalHits: 1, isBlocked: false });
    const guard = await buildGuardAndInit({ increment });

    await guard.canActivate(buildContext({ ip: '1.1.1.1' }));
    await guard.canActivate(buildContext({ ip: '1.1.1.1' }));
    await guard.canActivate(buildContext({ ip: '2.2.2.2' }));

    expect(increment.mock.calls[0][0]).toBe(increment.mock.calls[1][0]);
    expect(increment.mock.calls[0][0]).not.toBe(increment.mock.calls[2][0]);
  });

  it('should reject with 429 once the limit is exceeded', async () => {
    const increment = jest.fn().mockResolvedValue({
      totalHits: 2,
      timeToExpire: 60_000,
      isBlocked: true,
      timeToBlockExpire: 60_000,
    });
    const guard = await buildGuardAndInit({ increment });

    await expect(
      guard.canActivate(buildContext({ user: { id: 42 }, ip: '1.1.1.1' })),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('should let a request within the limit through', async () => {
    const increment = jest
      .fn()
      .mockResolvedValue({ totalHits: 1, isBlocked: false });
    const guard = await buildGuardAndInit({ increment });

    await expect(
      guard.canActivate(buildContext({ user: { id: 42 }, ip: '1.1.1.1' })),
    ).resolves.toBe(true);
  });
});
