import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Env } from '../../common/config/env.validation';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const prisma = { user: { findUnique: jest.fn() } };
  const config = {
    get: () => 'test-secret',
  } as unknown as ConfigService<Env, true>;
  const strategy = new JwtStrategy(prisma as unknown as PrismaService, config);

  const user = {
    id: 3,
    username: 'alice',
    email: 'alice@example.com',
    isActive: true,
    isEmailVerified: true,
  };

  beforeEach(() => prisma.user.findUnique.mockReset());

  it('returns the current user without the password hash', async () => {
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(
      strategy.validate({ sub: 3, email: 'alice@example.com' }),
    ).resolves.toBe(user);

    const { where, select } = prisma.user.findUnique.mock.calls[0][0];
    expect(where).toEqual({ id: 3 });
    expect(select).not.toHaveProperty('passwordHash');
  });

  it.each([
    ['a deleted user', null, 'Unauthorized'],
    ['a deactivated user', { ...user, isActive: false }, 'Unauthorized'],
    [
      'an unverified email',
      { ...user, isEmailVerified: false },
      'Email not verified',
    ],
  ])('rejects %s', async (_label, found, message) => {
    prisma.user.findUnique.mockResolvedValue(found);

    const result = strategy.validate({ sub: 3, email: 'alice@example.com' });

    await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(result).rejects.toThrow(message);
  });
});
