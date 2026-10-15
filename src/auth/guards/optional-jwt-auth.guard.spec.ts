import { UnauthorizedException } from '@nestjs/common';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

const namedError = (name: string) => Object.assign(new Error(name), { name });

describe('OptionalJwtAuthGuard', () => {
  const guard = new OptionalJwtAuthGuard();

  it('returns the user when the token is valid', () => {
    const user = { id: 1 };
    expect(guard.handleRequest(null, user, undefined)).toBe(user);
  });

  it('lets a request without a token through as anonymous', () => {
    expect(guard.handleRequest(null, false, namedError('Error'))).toBeNull();
  });

  it.each(['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'])(
    'rejects a token that is present but unusable (%s)',
    (name) => {
      expect(() => guard.handleRequest(null, false, namedError(name))).toThrow(
        UnauthorizedException,
      );
    },
  );

  it('treats an account the strategy refuses as anonymous', () => {
    expect(
      guard.handleRequest(new UnauthorizedException(), false, undefined),
    ).toBeNull();
  });
});
