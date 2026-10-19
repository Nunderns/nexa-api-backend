import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/config/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createCommunity,
  createTestPrisma,
  createUser,
  resetDatabase,
  waitFor,
} from './db/test-database';

/**
 * Whole-feature coverage: real HTTP, real Socket.IO over a real port, the
 * real JWT strategy, guards, validation and envelope, and a real PostgreSQL
 * (the throwaway PGlite instance from the global setup).
 *
 * The app is rebuilt per test because throttler and connection-limit
 * counters live in memory per instance.
 */

const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const tokenFor = (userId: number, expiresIn: number | string = '15m') =>
  jwt.sign(
    { sub: userId, email: `user${userId}@example.com` },
    { expiresIn: expiresIn as number },
  );

interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  resourceType: string | null;
  resourceId: number | null;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
}

describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let baseUrl: string;
  const sockets: Socket[] = [];

  let alice: number;
  let bob: number;
  let carol: number;
  let communityId: number;

  const http = () => request(app.getHttpServer());
  const auth = (userId: number) => ({
    Authorization: `Bearer ${tokenFor(userId)}`,
  });

  function connect(
    options: { token?: string; origin?: string } = {},
  ): Promise<Socket> {
    const socket = io(`${baseUrl}/notifications`, {
      auth: options.token === undefined ? {} : { token: options.token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      extraHeaders: options.origin ? { origin: options.origin } : undefined,
    });
    sockets.push(socket);

    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (error) => reject(error));
    });
  }

  function nextEvent<T>(
    socket: Socket,
    event: string,
    timeoutMs = 3_000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`no ${event} within ${timeoutMs}ms`)),
        timeoutMs,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  /** Records every event a socket receives, for "nothing arrived" checks. */
  function record(socket: Socket): { event: string; payload: unknown }[] {
    const received: { event: string; payload: unknown }[] = [];
    socket.onAny((event: string, payload: unknown) =>
      received.push({ event, payload }),
    );
    return received;
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

  const notificationsOf = (userId: number) =>
    prisma.notification.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'asc' },
    });

  async function createPost(authorId: number, title = 'A post') {
    const response = await http()
      .post('/posts')
      .set(auth(authorId))
      .send({ communityId, title, content: 'body', postType: 'TEXT' })
      .expect(201);
    return (response.body as { data: { id: number } }).data.id;
  }

  async function comment(
    authorId: number,
    postId: number,
    content: string,
    parentId?: number,
  ) {
    const response = await http()
      .post('/comments')
      .set(auth(authorId))
      .send({ postId, content, ...(parentId ? { parentId } : {}) })
      .expect(201);
    return (response.body as { data: { id: number } }).data.id;
  }

  beforeEach(async () => {
    prisma = createTestPrisma();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.listen(0, '127.0.0.1');
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

    await resetDatabase(prisma);
    alice = (await createUser(prisma, 'alice')).id;
    bob = (await createUser(prisma, 'bob')).id;
    carol = (await createUser(prisma, 'carol')).id;
    communityId = (
      await createCommunity(prisma, alice, 'general', [bob, carol])
    ).id;
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.disconnect();
    }
    await app.close();
  });

  describe('reply flow (A posts, B replies)', () => {
    it('persists, pushes, lists, marks read and isolates users', async () => {
      // 1. User A creates a post, and is connected in real time.
      const postId = await createPost(alice);
      const aliceSocket = await connect({ token: tokenFor(alice) });
      const pushed = nextEvent<NotificationPayload>(
        aliceSocket,
        'notification:new',
      );
      const counted = new Promise<{ count: number }>((resolve) => {
        aliceSocket.on(
          'notification:unread-count',
          (payload: { count: number }) => {
            if (payload.count === 1) resolve(payload);
          },
        );
      });

      // 2. User B replies to the post.
      const commentId = await comment(bob, postId, 'Great post!');

      // 3. A persisted notification exists for A.
      const [stored] = await waitFor(async () => {
        const rows = await notificationsOf(alice);
        return rows.length > 0 && rows;
      });
      expect(stored).toMatchObject({
        type: 'POST_REPLY',
        actorId: bob,
        resourceType: 'COMMENT',
        resourceId: commentId,
        metadata: { postId, commentId, parentId: null },
        isRead: false,
      });

      // 4. A received the real-time event, with the same id.
      const event = await pushed;
      expect(event).toMatchObject({
        id: stored.id,
        type: 'POST_REPLY',
        title: 'New comment',
        body: '@bob commented on your post',
        resourceType: 'COMMENT',
        resourceId: commentId,
        isRead: false,
      });
      await expect(counted).resolves.toEqual({ count: 1 });

      // 5. A retrieves it over REST.
      const list = await http()
        .get('/notifications')
        .set(auth(alice))
        .expect(200);
      expect(list.body.data).toMatchObject({
        hasMore: false,
        nextCursor: null,
        data: [{ id: stored.id, actor: { id: bob, username: 'bob' } }],
      });

      // 6. A marks it as read, and the socket hears about it.
      const readEvent = nextEvent<{ id: string; unreadCount: number }>(
        aliceSocket,
        'notification:read',
      );
      const read = await http()
        .patch(`/notifications/${stored.id}/read`)
        .set(auth(alice))
        .expect(200);
      expect(read.body.data).toMatchObject({ id: stored.id, isRead: true });
      await expect(readEvent).resolves.toMatchObject({
        id: stored.id,
        unreadCount: 0,
      });

      // 7. The unread count is updated.
      const count = await http()
        .get('/notifications/unread-count')
        .set(auth(alice))
        .expect(200);
      expect(count.body.data).toEqual({ count: 0 });

      // 8. User C cannot see or touch A's notifications.
      const carolList = await http()
        .get('/notifications')
        .set(auth(carol))
        .expect(200);
      expect(carolList.body.data.data).toEqual([]);
      await http()
        .patch(`/notifications/${stored.id}/read`)
        .set(auth(carol))
        .expect(404);
      await http()
        .delete(`/notifications/${stored.id}`)
        .set(auth(carol))
        .expect(404);
      expect(await prisma.notification.count()).toBe(1);
    });

    it('notifies the parent author of a nested reply, not the post author', async () => {
      const postId = await createPost(alice);
      const parentId = await comment(bob, postId, 'first');
      await waitFor(async () => (await notificationsOf(alice)).length === 1);

      await comment(carol, postId, 'reply to bob', parentId);

      const [reply] = await waitFor(async () => {
        const rows = await notificationsOf(bob);
        return rows.length > 0 && rows;
      });
      expect(reply).toMatchObject({
        type: 'COMMENT_REPLY',
        actorId: carol,
        metadata: { postId, parentId },
      });
      await settle();
      expect(await notificationsOf(alice)).toHaveLength(1);
    });

    it('does not notify users about their own comments', async () => {
      const postId = await createPost(alice);

      await comment(alice, postId, 'replying to myself');
      await settle();

      expect(await prisma.notification.count()).toBe(0);
    });
  });

  describe('mentions', () => {
    it('notifies mentioned users once, gives replies precedence and handles edits', async () => {
      const postId = await createPost(alice);
      const dave = (await createUser(prisma, 'dave')).id;

      // alice is the reply recipient AND mentioned: only the reply.
      const commentId = await comment(
        bob,
        postId,
        'hey @alice and @carol @carol, also @nobody and @bob',
      );

      await waitFor(async () => (await notificationsOf(carol)).length === 1);
      await settle();
      expect((await notificationsOf(alice)).map((n) => n.type)).toEqual([
        'POST_REPLY',
      ]);
      expect((await notificationsOf(bob)).length).toBe(0);
      expect(await notificationsOf(carol)).toEqual([
        expect.objectContaining({
          type: 'USER_MENTION',
          resourceType: 'COMMENT',
          resourceId: commentId,
        }),
      ]);

      // Editing with the same mentions plus a new one notifies only the new.
      await http()
        .put(`/comments/${commentId}`)
        .set(auth(bob))
        .send({ content: 'edited: @carol @dave' })
        .expect(200);

      await waitFor(async () => (await notificationsOf(dave)).length === 1);
      await settle();
      expect(await notificationsOf(carol)).toHaveLength(1);
    });

    it('notifies users mentioned in a post', async () => {
      await createPost(alice, 'Thoughts, @bob?');

      const [mention] = await waitFor(async () => {
        const rows = await notificationsOf(bob);
        return rows.length > 0 && rows;
      });
      expect(mention).toMatchObject({
        type: 'USER_MENTION',
        resourceType: 'POST',
      });
    });
  });

  describe('votes', () => {
    it('notifies once per voter, never for self-votes or downvotes', async () => {
      const postId = await createPost(alice);

      await http()
        .post(`/votes/post/${postId}`)
        .set(auth(alice))
        .send({ vote: 1 })
        .expect(201);
      await http()
        .post(`/votes/post/${postId}`)
        .set(auth(carol))
        .send({ vote: -1 })
        .expect(201);
      await settle();
      expect(await notificationsOf(alice)).toHaveLength(0);

      await http()
        .post(`/votes/post/${postId}`)
        .set(auth(bob))
        .send({ vote: 1 })
        .expect(201);
      await waitFor(async () => (await notificationsOf(alice)).length === 1);

      for (const vote of [0, 1, 1]) {
        http()
          .post(`/votes/post/${postId}`)
          .set(auth(bob))
          .send({ vote })
          .expect(201);
      }
      await settle();

      expect(await notificationsOf(alice)).toEqual([
        expect.objectContaining({ type: 'POST_UPVOTE', actorId: bob }),
      ]);
    });

    it('notifies the author of an upvoted comment', async () => {
      const postId = await createPost(alice);
      const commentId = await comment(bob, postId, 'a comment');

      await http()
        .post(`/votes/comment/${commentId}`)
        .set(auth(carol))
        .send({ vote: 1 })
        .expect(201);

      const [upvote] = await waitFor(async () => {
        const rows = await notificationsOf(bob);
        return rows.length > 0 && rows;
      });
      expect(upvote).toMatchObject({
        type: 'COMMENT_UPVOTE',
        resourceId: commentId,
        metadata: { postId, commentId },
      });
    });
  });

  describe('direct messages', () => {
    it('notifies the recipient only, without the message content', async () => {
      const chat = await http()
        .post('/chats')
        .set(auth(alice))
        .send({ userId: bob })
        .expect(200);
      const chatId = (chat.body as { data: { id: number } }).data.id;

      const bobSocket = await connect({ token: tokenFor(bob) });
      const carolSocket = await connect({ token: tokenFor(carol) });
      const carolEvents = record(carolSocket);
      const pushed = nextEvent<NotificationPayload>(
        bobSocket,
        'notification:new',
      );

      await http()
        .post(`/chats/${chatId}/messages`)
        .set(auth(alice))
        .send({ content: 'top secret plans' })
        .expect(201);

      const event = await pushed;
      expect(event).toMatchObject({
        type: 'DIRECT_MESSAGE',
        resourceType: 'CHAT',
        resourceId: chatId,
        body: '@alice sent you a message',
      });
      expect(JSON.stringify(event)).not.toContain('top secret');

      const rows = await prisma.notification.findMany();
      expect(JSON.stringify(rows)).not.toContain('top secret');

      await settle();
      expect(carolEvents.filter((e) => e.event === 'notification:new')).toEqual(
        [],
      );
      expect(await notificationsOf(alice)).toHaveLength(0);
    });

    it('respects a disabled direct-message preference', async () => {
      await http()
        .patch('/notifications/preferences')
        .set(auth(bob))
        .send({ directMessages: false })
        .expect(200);
      const chat = await http()
        .post('/chats')
        .set(auth(alice))
        .send({ userId: bob })
        .expect(200);

      await http()
        .post(
          `/chats/${(chat.body as { data: { id: number } }).data.id}/messages`,
        )
        .set(auth(alice))
        .send({ content: 'hi' })
        .expect(201);
      await settle();

      expect(await notificationsOf(bob)).toHaveLength(0);
    });
  });

  describe('WebSocket authentication and delivery', () => {
    it('sends the current unread count on connect', async () => {
      const postId = await createPost(alice);
      await comment(bob, postId, 'hi');
      await waitFor(async () => (await notificationsOf(alice)).length === 1);

      const socket = io(`${baseUrl}/notifications`, {
        auth: { token: tokenFor(alice) },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);

      await expect(
        nextEvent(socket, 'notification:unread-count'),
      ).resolves.toEqual({ count: 1 });
    });

    it('rejects a connection without a JWT', async () => {
      await expect(connect()).rejects.toThrow('Unauthorized');
    });

    it('rejects an invalid JWT', async () => {
      await expect(connect({ token: 'not.a.jwt' })).rejects.toThrow(
        'Unauthorized',
      );
      const forged = new JwtService({ secret: 'someone-else' }).sign({
        sub: alice,
        email: 'x',
      });
      await expect(connect({ token: forged })).rejects.toThrow('Unauthorized');
    });

    it('rejects an expired JWT', async () => {
      await expect(connect({ token: tokenFor(alice, -10) })).rejects.toThrow(
        'Unauthorized',
      );
    });

    it('rejects a user whose e-mail is not verified', async () => {
      await prisma.user.update({
        where: { id: alice },
        data: { isEmailVerified: false },
      });

      await expect(connect({ token: tokenFor(alice) })).rejects.toThrow(
        'Unauthorized',
      );
    });

    it('rejects a browser origin outside FRONTEND_URL and accepts an allowed one', async () => {
      await expect(
        connect({ token: tokenFor(alice), origin: 'https://evil.example.com' }),
      ).rejects.toThrow();

      await expect(
        connect({ token: tokenFor(alice), origin: 'http://localhost:5173' }),
      ).resolves.toBeDefined();
    });

    it('delivers to every connection of the recipient and to nobody else', async () => {
      const tabOne = await connect({ token: tokenFor(alice) });
      const tabTwo = await connect({ token: tokenFor(alice) });
      const carolSocket = await connect({ token: tokenFor(carol) });
      const carolEvents = record(carolSocket);
      const postId = await createPost(alice);

      const both = Promise.all([
        nextEvent<NotificationPayload>(tabOne, 'notification:new'),
        nextEvent<NotificationPayload>(tabTwo, 'notification:new'),
      ]);
      await comment(bob, postId, 'hello');

      const [one, two] = await both;
      expect(one.id).toBe(two.id);

      await settle();
      expect(carolEvents.map((e) => e.event)).not.toContain('notification:new');
    });

    it("cannot join another user's room", async () => {
      const carolSocket = await connect({ token: tokenFor(carol) });
      const carolEvents = record(carolSocket);

      // There is no client event; these are simply ignored by the server.
      carolSocket.emit('join', `user:${alice}`);
      carolSocket.emit('subscribe', { room: `user:${alice}` });
      carolSocket.emit('notification:new', { forged: true });

      const postId = await createPost(alice);
      await comment(bob, postId, 'hi alice');
      await waitFor(async () => (await notificationsOf(alice)).length === 1);
      await settle();

      expect(carolEvents.map((e) => e.event)).not.toContain('notification:new');
      expect(carolSocket.connected).toBe(true);
    });

    it('recovers notifications missed while disconnected through REST', async () => {
      const postId = await createPost(alice);
      const first = await connect({ token: tokenFor(alice) });
      const pushed = nextEvent<NotificationPayload>(first, 'notification:new');
      await comment(bob, postId, 'while online');
      const seen = await pushed;

      first.disconnect();
      await comment(carol, postId, 'while offline');
      await waitFor(async () => (await notificationsOf(alice)).length === 2);

      const second = await connect({ token: tokenFor(alice) });
      expect(second.connected).toBe(true);

      const page = await http()
        .get('/notifications')
        .query({ unreadOnly: 'true' })
        .set(auth(alice))
        .expect(200);
      const ids = (page.body.data.data as { id: string; body: string }[]).map(
        (n) => n.id,
      );
      expect(ids).toHaveLength(2);
      expect(ids).toContain(seen.id);
      expect(page.body.data.data[0].body).toBe('@carol commented on your post');
    });
  });

  describe('REST validation and authorization', () => {
    it('requires authentication on every endpoint', async () => {
      await http().get('/notifications').expect(401);
      await http().get('/notifications/unread-count').expect(401);
      await http().patch('/notifications/read-all').expect(401);
      await http().get('/notifications/preferences').expect(401);
    });

    it('validates ids, query parameters and preference bodies', async () => {
      await http()
        .patch('/notifications/not-a-uuid/read')
        .set(auth(alice))
        .expect(400);
      await http()
        .get('/notifications')
        .query({ limit: 1000 })
        .set(auth(alice))
        .expect(400);
      await http()
        .get('/notifications')
        .query({ type: 'NOPE' })
        .set(auth(alice))
        .expect(400);
      await http()
        .get('/notifications')
        .query({ recipientId: bob })
        .set(auth(alice))
        .expect(400);
      await http()
        .get('/notifications')
        .query({ cursor: Buffer.from('x|y').toString('base64url') })
        .set(auth(alice))
        .expect(400);
      await http()
        .patch('/notifications/preferences')
        .set(auth(alice))
        .send({ votes: 'no' })
        .expect(400);
      await http()
        .patch('/notifications/preferences')
        .set(auth(alice))
        .send({ userId: bob, votes: false })
        .expect(400);
    });

    it('answers 404 for an unknown notification', async () => {
      await http()
        .patch('/notifications/3f1c0d52-8a0e-4c4e-9d7a-2b1e6f0c9a11/read')
        .set(auth(alice))
        .expect(404);
    });

    it('updates preferences partially and returns all of them', async () => {
      await http()
        .get('/notifications/preferences')
        .set(auth(alice))
        .expect(200)
        .expect(({ body }) =>
          expect(body.data).toEqual({
            postReplies: true,
            commentReplies: true,
            mentions: true,
            votes: true,
            directMessages: true,
          }),
        );

      const updated = await http()
        .patch('/notifications/preferences')
        .set(auth(alice))
        .send({ votes: false })
        .expect(200);
      expect(updated.body.data).toMatchObject({ votes: false, mentions: true });
    });

    it('marks all as read and deletes, keeping counts consistent', async () => {
      const postId = await createPost(alice);
      await comment(bob, postId, 'one');
      await comment(carol, postId, 'two');
      await waitFor(async () => (await notificationsOf(alice)).length === 2);

      const all = await http()
        .patch('/notifications/read-all')
        .set(auth(alice))
        .expect(200);
      expect(all.body.data).toEqual({ updated: 2, unreadCount: 0 });

      const [first] = await notificationsOf(alice);
      await http()
        .delete(`/notifications/${first.id}`)
        .set(auth(alice))
        .expect(204);
      await http()
        .delete(`/notifications/${first.id}`)
        .set(auth(alice))
        .expect(404);
      expect(await notificationsOf(alice)).toHaveLength(1);
    });

    it('paginates with a cursor', async () => {
      await prisma.notification.createMany({
        data: Array.from({ length: 5 }, (_, i) => ({
          recipientId: alice,
          type: 'SYSTEM' as const,
          title: 'System',
          body: `n${i}`,
          createdAt: new Date(Date.UTC(2026, 9, 16, 12, 0, i)),
        })),
      });

      const first = await http()
        .get('/notifications')
        .query({ limit: 2 })
        .set(auth(alice))
        .expect(200);
      expect(first.body.data.data.map((n: { body: string }) => n.body)).toEqual(
        ['n4', 'n3'],
      );

      const second = await http()
        .get('/notifications')
        .query({ limit: 2, cursor: first.body.data.nextCursor })
        .set(auth(alice))
        .expect(200);
      expect(
        second.body.data.data.map((n: { body: string }) => n.body),
      ).toEqual(['n2', 'n1']);
    });
  });
});
