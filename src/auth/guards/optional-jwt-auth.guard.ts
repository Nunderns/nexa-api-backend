import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Errors jsonwebtoken reports for a token that is present but unusable. */
const TOKEN_ERRORS = new Set([
  'JsonWebTokenError',
  'TokenExpiredError',
  'NotBeforeError',
]);

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(_err: unknown, user: TUser, info: unknown): TUser {
    if (user) {
      return user;
    }

    if (info instanceof Error && TOKEN_ERRORS.has(info.name)) {
      throw new UnauthorizedException();
    }

    return null as TUser;
  }
}
