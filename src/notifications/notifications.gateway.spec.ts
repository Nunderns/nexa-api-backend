import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Namespace, Socket } from 'socket.io';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import {
  MAX_SOCKETS_PER_USER,
  NotificationSocketEvent,
} from './notifications.constants';
import {
  clientIp,
  extractToken,
  NotificationsGateway,
} from './notifications.gateway';
import { NotificationsRepository } from './notifications.repository';

type Middleware = (socket: Socket, next: (error?: Error) => void) => void;

const handshake = (
  overrides: Partial<Socket['handshake']> = {},
): Socket['handshake'] =>
  ({
    auth: {},
    headers: {},
    address: '10.0.0.1',
    ...overrides,
  }) as Socket['handshake'];

describe('extractToken', () => {
  it('reads auth.token', () => {
    expect(extractToken(handshake({ auth: { token: 'abc' } }))).toBe('abc');
  });

  it('reads a Bearer authorization header', () => {
    expect(
      extractToken(handshake({ headers: { authorization: 'Bearer xyz' } })),
    ).toBe('xyz');
  });

  it.each([
    ['nothing', handshake()],
    [
      'a non-bearer header',
      handshake({ headers: { authorization: 'Basic x' } }),
    ],
    ['a non-string token', handshake({ auth: { token: 42 } })],
    ['an empty bearer', handshake({ headers: { authorization: 'Bearer ' } })],
  ])('returns null for %s', (_label, source) => {
    expect(extractToken(source)).toBeNull();
  });
});

describe('clientIp', () => {
  it('uses the socket address without proxies', () => {
    expect(clientIp(handshake(), 0)).toBe('10.0.0.1');
  });

  it('trusts exactly `hops` proxies, ignoring forged entries further left', () => {
    const source = handshake({
      headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.5' },
    });

    expect(clientIp(source, 1)).toBe('203.0.113.5');
    expect(clientIp(source, 2)).toBe('6.6.6.6');
  });
});

describe('NotificationsGateway', () => {
  let jwt: { verifyAsync: jest.Mock };
  let strategy: { validate: jest.Mock };
  let repository: { countUnread: jest.Mock };
  let gateway: NotificationsGateway;
  let middleware: Middleware;
  let emitToRoom: jest.Mock;
  let to: jest.Mock;

  const makeSocket = (
    id: string,
    source = handshake({ auth: { token: 't' } }),
  ) => {
    const mocks = {
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    return {
      id,
      handshake: source,
      data: {},
      ...mocks,
      mocks,
    } as unknown as Socket & { mocks: typeof mocks };
  };

  const runMiddleware = (socket: Socket) =>
    new Promise<Error | undefined>((resolve) => middleware(socket, resolve));

  beforeEach(() => {
    jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 1,
        email: 'a@x',
        exp: Date.now() / 1000 + 900,
      }),
    };
    strategy = { validate: jest.fn().mockResolvedValue({ id: 1 }) };
    repository = { countUnread: jest.fn().mockResolvedValue(3) };
    gateway = new NotificationsGateway(
      jwt as unknown as JwtService,
      strategy as unknown as JwtStrategy,
      repository as unknown as NotificationsRepository,
    );

    emitToRoom = jest.fn();
    to = jest.fn().mockReturnValue({ emit: emitToRoom });
    const server = {
      use: (fn: Middleware) => {
        middleware = fn;
      },
      to,
    } as unknown as Namespace;
    (gateway as unknown as { server: Namespace }).server = server;
    gateway.afterInit(server);
  });

  it('accepts a valid token and stores the user id server-side', async () => {
    const socket = makeSocket('s1');

    await expect(runMiddleware(socket)).resolves.toBeUndefined();
    expect((socket.data as { userId: number }).userId).toBe(1);
    gateway.handleDisconnect(socket);
  });

  it('refuses a handshake without a token', async () => {
    const error = await runMiddleware(makeSocket('s1', handshake()));

    expect(error?.message).toBe('Unauthorized');
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('refuses an invalid or expired token', async () => {
    jwt.verifyAsync.mockRejectedValue(
      Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' }),
    );

    expect((await runMiddleware(makeSocket('s1')))?.message).toBe(
      'Unauthorized',
    );
  });

  it('refuses an account the JWT strategy rejects (inactive, unverified)', async () => {
    strategy.validate.mockRejectedValue(new UnauthorizedException());

    expect((await runMiddleware(makeSocket('s1')))?.message).toBe(
      'Unauthorized',
    );
  });

  it('ignores any user id the client claims in auth', async () => {
    const socket = makeSocket(
      's1',
      handshake({ auth: { token: 't', userId: 99 } }),
    );

    await runMiddleware(socket);

    expect((socket.data as { userId: number }).userId).toBe(1);
    gateway.handleDisconnect(socket);
  });

  it('joins only the room of the authenticated user and sends the unread count', async () => {
    const socket = makeSocket('s1');
    await runMiddleware(socket);

    await gateway.handleConnection(socket);

    expect(socket.mocks.join).toHaveBeenCalledWith('user:1');
    expect(socket.mocks.emit).toHaveBeenCalledWith(
      NotificationSocketEvent.UnreadCount,
      { count: 3 },
    );
    gateway.handleDisconnect(socket);
  });

  it('drops a socket that reached handleConnection unauthenticated', async () => {
    const socket = makeSocket('s1');

    await gateway.handleConnection(socket);

    expect(socket.mocks.disconnect).toHaveBeenCalledWith(true);
    expect(socket.mocks.join).not.toHaveBeenCalled();
  });

  it('tracks several sockets per user and forgets them on disconnect', async () => {
    const a = makeSocket('a');
    const b = makeSocket('b');
    for (const socket of [a, b]) {
      await runMiddleware(socket);
      await gateway.handleConnection(socket);
    }
    expect(gateway.connectionCount(1)).toBe(2);

    gateway.handleDisconnect(a);
    gateway.handleDisconnect(b);
    expect(gateway.connectionCount(1)).toBe(0);
  });

  it(`caps a user at ${MAX_SOCKETS_PER_USER} sockets`, async () => {
    const sockets = Array.from({ length: MAX_SOCKETS_PER_USER }, (_, i) =>
      makeSocket(`s${i}`),
    );
    for (const socket of sockets) {
      await runMiddleware(socket);
      await gateway.handleConnection(socket);
    }

    const error = await runMiddleware(makeSocket('extra'));

    expect(error?.message).toBe('Too many connections');
    sockets.forEach((socket) => gateway.handleDisconnect(socket));
  });

  it('disconnects the socket when its token expires', async () => {
    jest.useFakeTimers();
    try {
      jwt.verifyAsync.mockResolvedValue({
        sub: 1,
        email: 'a@x',
        exp: Math.floor(Date.now() / 1000) + 60,
      });
      const socket = makeSocket('s1');
      await runMiddleware(socket);

      jest.advanceTimersByTime(61_000);

      expect(socket.mocks.disconnect).toHaveBeenCalledWith(true);
      gateway.handleDisconnect(socket);
    } finally {
      jest.useRealTimers();
    }
  });

  it('publishes to the user room only', () => {
    gateway.publishToUser(5, NotificationSocketEvent.New, { id: 'x' });

    expect(to).toHaveBeenCalledWith('user:5');
    expect(emitToRoom).toHaveBeenCalledWith(NotificationSocketEvent.New, {
      id: 'x',
    });
  });

  it('never throws from a failed push', () => {
    to.mockImplementation(() => {
      throw new Error('adapter down');
    });

    expect(() => gateway.publishToUser(5, 'x', {})).not.toThrow();
  });
});
