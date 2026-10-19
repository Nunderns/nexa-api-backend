import { NotificationType, Prisma } from '@prisma/client';
import { NotificationsRepository } from '../src/notifications/notifications.repository';
import {
  NotificationsService,
  NotifyRequest,
} from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createCommunity,
  createTestPrisma,
  createUser,
  resetDatabase,
} from './db/test-database';

/**
 * Repository and service against a real PostgreSQL (the throwaway PGlite
 * instance from the global setup), with the real migrations applied. These
 * cover what mocks cannot: SQL constraints, ordering, cascades, the unique
 * dedupe index and the cursor query.
 */
describe('Notifications persistence (integration)', () => {
  let prisma: PrismaService;
  let repository: NotificationsRepository;
  let service: NotificationsService;
  const publisher = { publishToUser: jest.fn() };

  let alice: number;
  let bob: number;
  let carol: number;

  const request = (overrides: Partial<NotifyRequest> = {}): NotifyRequest => ({
    recipientId: alice,
    actorId: bob,
    type: NotificationType.POST_REPLY,
    resourceType: 'COMMENT',
    resourceId: 1,
    metadata: { postId: 1, commentId: 1 },
    dedupeKey: 'comment:1:reply',
    ...overrides,
  });

  async function seedNotifications(count: number, sameTimestamp = false) {
    const createdAt = new Date('2026-10-16T12:00:00.000Z');
    await prisma.notification.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        recipientId: alice,
        actorId: bob,
        type: NotificationType.POST_UPVOTE,
        title: 'New upvote',
        body: `n${i}`,
        createdAt: sameTimestamp
          ? createdAt
          : new Date(createdAt.getTime() + i * 1000),
      })),
    });
  }

  async function collectAll(limit: number, unreadOnly = false) {
    const seen: string[] = [];
    let cursor: string | undefined;

    for (let guard = 0; guard < 50; guard++) {
      const page = await service.list(alice, { limit, cursor, unreadOnly });
      seen.push(...page.data.map((n) => n.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    return seen;
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    await prisma.$connect();
    repository = new NotificationsRepository(prisma);
    service = new NotificationsService(repository, publisher);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    publisher.publishToUser.mockClear();
    alice = (await createUser(prisma, 'alice')).id;
    bob = (await createUser(prisma, 'bob')).id;
    carol = (await createUser(prisma, 'carol')).id;
  });

  describe('persistence and relations', () => {
    it('stores a notification with a UUID id and the actor relation', async () => {
      const [created] = await service.notify([request()]);

      expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(created.actor).toEqual({
        id: bob,
        username: 'bob',
        displayName: 'bob',
        avatarUrl: null,
      });

      const row = await prisma.notification.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(row).toMatchObject({
        recipientId: alice,
        actorId: bob,
        isRead: false,
        readAt: null,
        body: '@bob commented on your post',
      });
    });

    it('deletes notifications with their recipient', async () => {
      await service.notify([request()]);

      await prisma.user.delete({ where: { id: alice } });

      expect(await prisma.notification.count()).toBe(0);
    });

    it('keeps notifications but clears the actor when the actor is deleted', async () => {
      const [created] = await service.notify([request()]);

      await prisma.user.delete({ where: { id: bob } });

      const row = await prisma.notification.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(row.actorId).toBeNull();
    });

    it('enforces read/readAt and resource consistency at the database level', async () => {
      const base = {
        recipientId: alice,
        type: NotificationType.SYSTEM,
        title: 't',
        body: 'b',
      };

      await expect(
        prisma.notification.create({ data: { ...base, isRead: true } }),
      ).rejects.toThrow();
      await expect(
        prisma.notification.create({
          data: { ...base, resourceType: 'POST' },
        }),
      ).rejects.toThrow();
    });
  });

  describe('idempotency', () => {
    it('stores one row per (recipient, dedupeKey), even across calls', async () => {
      await service.notify([request()]);
      const second = await service.notify([request()]);

      expect(second).toEqual([]);
      expect(await prisma.notification.count()).toBe(1);
    });

    it('survives concurrent duplicate events', async () => {
      await Promise.all(
        Array.from({ length: 5 }, () => service.notify([request()])),
      );

      expect(await prisma.notification.count()).toBe(1);
    });

    it('allows the same dedupeKey for different recipients', async () => {
      await service.notify([
        request({
          type: NotificationType.USER_MENTION,
          dedupeKey: 'mention:comment:1',
        }),
        request({
          recipientId: carol,
          type: NotificationType.USER_MENTION,
          dedupeKey: 'mention:comment:1',
        }),
      ]);

      expect(await prisma.notification.count()).toBe(2);
    });
  });

  describe('preferences', () => {
    it('suppresses creation for a disabled category and resumes when re-enabled', async () => {
      await service.updatePreferences(alice, { postReplies: false });
      await service.notify([request()]);
      expect(await prisma.notification.count()).toBe(0);

      await service.updatePreferences(alice, { postReplies: true });
      await service.notify([request()]);
      expect(await prisma.notification.count()).toBe(1);
    });

    it('never suppresses system notifications', async () => {
      await service.updatePreferences(alice, {
        postReplies: false,
        commentReplies: false,
        mentions: false,
        votes: false,
        directMessages: false,
      });

      await service.notifySystem(alice, 'Security', 'Your password changed');

      expect(await prisma.notification.count()).toBe(1);
    });
  });

  describe('cursor pagination', () => {
    it('walks every row exactly once, newest first', async () => {
      await seedNotifications(23);

      const ids = await collectAll(5);
      const expected = (
        await prisma.notification.findMany({
          where: { recipientId: alice },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true },
        })
      ).map((n) => n.id);

      expect(ids).toEqual(expected);
      expect(new Set(ids).size).toBe(23);
    });

    it('stays stable when many rows share a timestamp', async () => {
      await seedNotifications(12, true);

      const ids = await collectAll(5);

      expect(ids).toHaveLength(12);
      expect(new Set(ids).size).toBe(12);
    });

    it('is not shifted by rows inserted at the head between pages', async () => {
      await seedNotifications(10);
      const first = await service.list(alice, { limit: 4 });

      await service.notify([request({ dedupeKey: 'fresh' })]);
      const second = await service.list(alice, {
        limit: 4,
        cursor: first.nextCursor ?? undefined,
      });

      const overlap = second.data.filter((n) =>
        first.data.some((m) => m.id === n.id),
      );
      expect(overlap).toEqual([]);
      expect(
        second.data.every((n) => n.body !== '@bob commented on your post'),
      ).toBe(true);
    });

    it("never returns another user's notifications", async () => {
      await seedNotifications(3);

      const page = await service.list(carol, { limit: 50 });

      expect(page.data).toEqual([]);
    });
  });

  describe('read state and counts', () => {
    it('marks one, then all, keeping the unread count consistent', async () => {
      const created = await service.notify([
        request({ dedupeKey: 'a' }),
        request({ dedupeKey: 'b' }),
        request({ dedupeKey: 'c' }),
      ]);

      expect(await service.unreadCount(alice)).toEqual({ count: 3 });

      const read = await service.markRead(alice, created[0].id);
      expect(read.isRead).toBe(true);
      expect(read.readAt).toBeInstanceOf(Date);
      expect(await service.unreadCount(alice)).toEqual({ count: 2 });

      // Idempotent, and readAt keeps the first read time.
      const again = await service.markRead(alice, created[0].id);
      expect(again.readAt).toEqual(read.readAt);

      expect(await service.markAllRead(alice)).toEqual({
        updated: 2,
        unreadCount: 0,
      });
    });

    it('lists unread only when asked', async () => {
      const created = await service.notify([
        request({ dedupeKey: 'a' }),
        request({ dedupeKey: 'b' }),
      ]);
      await service.markRead(alice, created[0].id);

      const page = await service.list(alice, { limit: 10, unreadOnly: true });

      expect(page.data.map((n) => n.id)).toEqual([created[1].id]);
    });

    it("cannot read or delete another user's notification", async () => {
      const [created] = await service.notify([request()]);

      await expect(service.markRead(carol, created.id)).rejects.toThrow(
        'Notification not found',
      );
      await expect(service.remove(carol, created.id)).rejects.toThrow(
        'Notification not found',
      );

      const row = await prisma.notification.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(row.isRead).toBe(false);
    });

    it('deletes within a transaction and reports whether it was unread', async () => {
      const [created] = await service.notify([request()]);

      await expect(repository.delete(alice, created.id)).resolves.toEqual({
        wasUnread: true,
      });
      await expect(repository.delete(alice, created.id)).resolves.toBeNull();
    });

    it('counts unread for several users in one grouped query', async () => {
      await service.notify([
        request({ dedupeKey: 'a' }),
        request({ dedupeKey: 'b' }),
        request({ recipientId: carol, dedupeKey: 'c' }),
      ]);

      const counts = await repository.countUnreadMany([alice, carol, bob]);

      expect(Object.fromEntries(counts)).toEqual({
        [alice]: 2,
        [carol]: 1,
        [bob]: 0,
      });
    });
  });

  describe('mention resolution', () => {
    it('only resolves active users who can see the post', async () => {
      const dave = (await createUser(prisma, 'dave')).id;
      await prisma.user.update({
        where: { id: dave },
        data: { isActive: false },
      });

      const community = await createCommunity(
        prisma,
        alice,
        'secret',
        [bob],
        true,
      );
      const post = await prisma.post.create({
        data: {
          communityId: community.id,
          authorId: alice,
          title: 'private',
          postType: 'TEXT',
        },
      });

      // carol is not a member, dave is inactive, ghost does not exist.
      const ids = await repository.findMentionableUserIds(
        ['bob', 'carol', 'dave', 'ghost'],
        post.id,
      );

      expect(ids).toEqual([bob]);
    });

    it('excludes banned members of a private community', async () => {
      const community = await createCommunity(
        prisma,
        alice,
        'club',
        [bob],
        true,
      );
      await prisma.communityMember.update({
        where: {
          communityId_userId: { communityId: community.id, userId: bob },
        },
        data: { bannedAt: new Date() },
      });
      const post = await prisma.post.create({
        data: {
          communityId: community.id,
          authorId: alice,
          title: 'x',
          postType: 'TEXT',
        },
      });

      expect(await repository.findMentionableUserIds(['bob'], post.id)).toEqual(
        [],
      );
    });
  });

  it('treats metadata as JSON and never stores free text there', async () => {
    const [created] = await service.notify([request()]);

    const row = await prisma.notification.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.metadata).toEqual({ postId: 1, commentId: 1 });
    expect(row.metadata).not.toBeInstanceOf(Prisma.NullTypes.DbNull);
  });
});
