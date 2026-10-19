import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { JwtPayload, JwtStrategy } from '../auth/strategies/jwt.strategy';
import {
  TRUST_PROXY_HOPS,
  WS_CONNECT_IP_RATE_LIMIT,
} from '../common/config/rate-limit.config';
import { FixedWindowLimiter } from '../common/websocket/fixed-window-limiter';
import { NotificationPublisher } from './notification-publisher';
import {
  MAX_SOCKETS_PER_USER,
  NOTIFICATIONS_NAMESPACE,
  NotificationSocketEvent,
  userRoom,
} from './notifications.constants';
import { NotificationsRepository } from './notifications.repository';

/** What the server stores on an authenticated socket. Never client-provided. */
interface SocketSession {
  userId: number;
  expiryTimer?: NodeJS.Timeout;
}

type HandshakeSource = Pick<
  Socket['handshake'],
  'auth' | 'headers' | 'address'
>;

/** Error shape Socket.IO hands to the client as `connect_error`. */
function connectError(message: string): Error {
  return Object.assign(new Error(message), { data: { message } });
}

/**
 * Access token from `auth.token` (the Socket.IO client's `auth` option) or a
 * `Bearer` authorization header. Query strings are not accepted: they end up
 * in proxy and access logs.
 */
export function extractToken(handshake: HandshakeSource): string | null {
  const auth = handshake.auth as Record<string, unknown> | undefined;

  if (typeof auth?.token === 'string' && auth.token.length > 0) {
    return auth.token;
  }

  const header = handshake.headers.authorization;

  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length) || null;
  }

  return null;
}

/**
 * Client IP with the same proxy trust as Express (`trust proxy` hops): the
 * address `hops` entries from the right of `X-Forwarded-For`, so a client
 * cannot dodge the connection limit by forging the header.
 */
export function clientIp(handshake: HandshakeSource, hops: number): string {
  const forwarded = handshake.headers['x-forwarded-for'];
  const chain = (typeof forwarded === 'string' ? forwarded.split(',') : [])
    .map((entry) => entry.trim())
    .filter(Boolean);
  chain.push(handshake.address);

  return chain[Math.max(0, chain.length - 1 - hops)];
}

/**
 * Real-time delivery of notifications.
 *
 * - Authentication happens in namespace middleware, before the connection
 *   is accepted: the JWT is verified with the API's secret and the user is
 *   loaded through `JwtStrategy.validate`, so inactive or unverified accounts
 *   are refused exactly as on REST.
 * - Each socket joins `user:{id}` with the id from the verified token. There
 *   is no client event at all, so a client cannot join, leave or publish to
 *   any room.
 * - A socket is disconnected when its access token expires. The client
 *   reconnects with a refreshed token, which is also when a deactivated
 *   account is finally refused (tokens are stateless, so this is the
 *   revocation latency: at most one access token lifetime).
 * - Delivery is best-effort. The database is the source of truth; after a
 *   reconnect the client re-syncs over REST.
 */
@WebSocketGateway({ namespace: NOTIFICATIONS_NAMESPACE })
export class NotificationsGateway
  extends NotificationPublisher
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly socketsByUser = new Map<number, Set<string>>();
  private readonly connectLimiter = new FixedWindowLimiter(
    WS_CONNECT_IP_RATE_LIMIT,
  );

  @WebSocketServer()
  private readonly server?: Namespace;

  constructor(
    private readonly jwt: JwtService,
    private readonly jwtStrategy: JwtStrategy,
    private readonly repository: NotificationsRepository,
  ) {
    super();
  }

  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      this.authenticate(socket).then(
        () => next(),
        (error: Error) => next(error),
      );
    });
  }

  async handleConnection(socket: Socket): Promise<void> {
    const session = socket.data as Partial<SocketSession>;

    // Middleware guarantees this; refuse anything that slipped past it.
    if (typeof session.userId !== 'number') {
      socket.disconnect(true);
      return;
    }

    const userId = session.userId;
    const sockets = this.socketsByUser.get(userId) ?? new Set<string>();
    sockets.add(socket.id);
    this.socketsByUser.set(userId, sockets);

    await socket.join(userRoom(userId));

    try {
      const count = await this.repository.countUnread(userId);
      socket.emit(NotificationSocketEvent.UnreadCount, { count });
    } catch (error) {
      this.logger.warn({
        msg: 'Initial unread count failed',
        userId,
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  handleDisconnect(socket: Socket): void {
    const session = socket.data as Partial<SocketSession>;

    if (session.expiryTimer) {
      clearTimeout(session.expiryTimer);
      session.expiryTimer = undefined;
    }

    if (typeof session.userId !== 'number') {
      return;
    }

    const sockets = this.socketsByUser.get(session.userId);
    sockets?.delete(socket.id);

    if (sockets?.size === 0) {
      this.socketsByUser.delete(session.userId);
    }
  }

  publishToUser(userId: number, event: string, payload: unknown): void {
    try {
      this.server?.to(userRoom(userId)).emit(event, payload);
    } catch (error) {
      this.logger.warn({
        msg: 'Notification push failed',
        userId,
        event,
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  /** Number of live sockets of a user on this instance. */
  connectionCount(userId: number): number {
    return this.socketsByUser.get(userId)?.size ?? 0;
  }

  private async authenticate(socket: Socket): Promise<void> {
    if (
      !this.connectLimiter.hit(clientIp(socket.handshake, TRUST_PROXY_HOPS))
    ) {
      throw connectError('Too Many Requests');
    }

    const token = extractToken(socket.handshake);

    if (!token) {
      throw connectError('Unauthorized');
    }

    let payload: JwtPayload & { exp?: number };
    let userId: number;

    try {
      payload = await this.jwt.verifyAsync<JwtPayload & { exp?: number }>(
        token,
      );
      userId = (await this.jwtStrategy.validate(payload)).id;
    } catch {
      // Expired, malformed, wrong signature, unknown, inactive or unverified
      // account: one answer for all, and the token itself is never logged.
      throw connectError('Unauthorized');
    }

    if (this.connectionCount(userId) >= MAX_SOCKETS_PER_USER) {
      throw connectError('Too many connections');
    }

    const session = socket.data as SocketSession;
    session.userId = userId;

    if (payload.exp) {
      const msUntilExpiry = payload.exp * 1000 - Date.now();
      session.expiryTimer = setTimeout(
        () => socket.disconnect(true),
        Math.max(0, msUntilExpiry),
      );
      session.expiryTimer.unref();
    }
  }
}
