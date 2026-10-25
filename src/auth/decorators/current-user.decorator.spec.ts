import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';

/** Nest stores a param decorator's factory as route metadata; this reads it back. */
function factoryOf(data?: string) {
  class Host {
    handler(@CurrentUser(data) user: unknown) {
      return user;
    }
  }
  const metadata = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    Host,
    'handler',
  ) as Record<
    string,
    { factory: (d: unknown, ctx: ExecutionContext) => unknown }
  >;
  const { factory } = Object.values(metadata)[0];
  return (user: unknown) =>
    factory(data, {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext);
}

describe('CurrentUser', () => {
  const user = { id: 3, username: 'alice', email: 'alice@example.com' };

  it('returns the whole user', () => {
    expect(factoryOf()(user)).toBe(user);
  });

  it('returns one field of the user', () => {
    expect(factoryOf('id')(user)).toBe(3);
  });

  it('returns undefined for an anonymous request', () => {
    expect(factoryOf('id')(undefined)).toBeUndefined();
  });
});
