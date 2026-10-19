import { NotFoundException } from '@nestjs/common';
import {
  NotificationResourceType,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { encodeCursor } from './notification-cursor';
import { NotificationSocketEvent } from './notifications.constants';
import {
  NewNotification,
  NotificationRecord,
  NotificationsRepository,
} from './notifications.repository';
import { NotificationsService, NotifyRequest } from './notifications.service';

const ID = '3f1c0d52-8a0e-4c4e-9d7a-2b1e6f0c9a11';

const record = (
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord => ({
  id: ID,
  recipientId: 1,
  type: NotificationType.COMMENT_REPLY,
  title: 'New reply',
  body: '@bob replied to your comment',
  resourceType: NotificationResourceType.COMMENT,
  resourceId: 10,
  metadata: { postId: 1, commentId: 10 },
  isRead: false,
  readAt: null,
  createdAt: new Date('2026-10-16T12:00:00.000Z'),
  actor: { id: 2, username: 'bob', displayName: 'Bob', avatarUrl: null },
  ...overrides,
});

const request = (overrides: Partial<NotifyRequest> = {}): NotifyRequest => ({
  recipientId: 1,
  actorId: 2,
  type: NotificationType.COMMENT_REPLY,
  resourceType: NotificationResourceType.COMMENT,
  resourceId: 10,
  metadata: { postId: 1, commentId: 10 },
  dedupeKey: 'comment:10:reply',
  ...overrides,
});

describe('NotificationsService', () => {
  let repository: jest.Mocked<
    Pick<
      NotificationsRepository,
      | 'createMany'
      | 'findPage'
      | 'findOne'
      | 'countUnread'
      | 'countUnreadMany'
      | 'markRead'
      | 'markAllRead'
      | 'delete'
      | 'findPreferences'
      | 'findPreferencesMany'
      | 'upsertPreferences'
      | 'findUsernames'
    >
  >;
  let publisher: { publishToUser: jest.Mock };
  let service: NotificationsService;

  beforeEach(() => {
    repository = {
      createMany: jest.fn((rows: NewNotification[]) =>
        Promise.resolve(
          rows.map((row) =>
            record({ recipientId: row.recipientId, type: row.type }),
          ),
        ),
      ),
      findPage: jest.fn(),
      findOne: jest.fn(),
      countUnread: jest.fn().mockResolvedValue(0),
      countUnreadMany: jest.fn((ids: number[]) =>
        Promise.resolve(new Map(ids.map((id) => [id, 1]))),
      ),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
      delete: jest.fn(),
      findPreferences: jest.fn(),
      findPreferencesMany: jest.fn().mockResolvedValue(new Map()),
      upsertPreferences: jest.fn(),
      findUsernames: jest.fn().mockResolvedValue(new Map([[2, 'bob']])),
    };
    publisher = { publishToUser: jest.fn() };
    service = new NotificationsService(
      repository as unknown as NotificationsRepository,
      publisher,
    );
  });

  describe('notify', () => {
    it('persists with server-built text and then pushes the notification and the count', async () => {
      const [created] = await service.notify([request()]);

      expect(repository.createMany).toHaveBeenCalledWith([
        expect.objectContaining({
          recipientId: 1,
          actorId: 2,
          title: 'New reply',
          body: '@bob replied to your comment',
          dedupeKey: 'comment:10:reply',
        }),
      ]);
      expect(created.id).toBe(ID);

      const pushOrder = publisher.publishToUser.mock.calls.map((c) => c[1]);
      expect(pushOrder).toEqual([
        NotificationSocketEvent.New,
        NotificationSocketEvent.UnreadCount,
      ]);
      expect(publisher.publishToUser).toHaveBeenCalledWith(
        1,
        NotificationSocketEvent.UnreadCount,
        { count: 1 },
      );
      // Persist strictly before push.
      expect(repository.createMany.mock.invocationCallOrder[0]).toBeLessThan(
        publisher.publishToUser.mock.invocationCallOrder[0],
      );
    });

    it('never notifies users about their own actions', async () => {
      const result = await service.notify([request({ recipientId: 2 })]);

      expect(result).toEqual([]);
      expect(repository.createMany).not.toHaveBeenCalled();
      expect(publisher.publishToUser).not.toHaveBeenCalled();
    });

    it('collapses duplicate requests for the same recipient and event', async () => {
      await service.notify([request(), request()]);

      expect(repository.createMany.mock.calls[0][0]).toHaveLength(1);
    });

    it('suppresses a category the recipient disabled, without storing or pushing', async () => {
      repository.findPreferencesMany.mockResolvedValue(
        new Map([
          [
            1,
            {
              postReplies: true,
              commentReplies: false,
              mentions: true,
              votes: true,
              directMessages: true,
            },
          ],
        ]),
      );

      await service.notify([
        request(),
        request({
          type: NotificationType.USER_MENTION,
          dedupeKey: 'mention:comment:10',
        }),
      ]);

      const stored = repository.createMany.mock.calls[0][0];
      expect(stored.map((row) => row.type)).toEqual([
        NotificationType.USER_MENTION,
      ]);
    });

    it('maps both upvote types to the votes switch', async () => {
      repository.findPreferencesMany.mockResolvedValue(
        new Map([
          [
            1,
            {
              postReplies: true,
              commentReplies: true,
              mentions: true,
              votes: false,
              directMessages: true,
            },
          ],
        ]),
      );

      await service.notify([
        request({ type: NotificationType.POST_UPVOTE, dedupeKey: 'v1' }),
        request({ type: NotificationType.COMMENT_UPVOTE, dedupeKey: 'v2' }),
      ]);

      expect(repository.createMany).toHaveBeenCalledWith([]);
    });

    it('pushes nothing for rows the database skipped as duplicates', async () => {
      repository.createMany.mockResolvedValue([]);

      const result = await service.notify([request()]);

      expect(result).toEqual([]);
      expect(publisher.publishToUser).not.toHaveBeenCalled();
    });

    it('retries a transient database error and succeeds', async () => {
      const transient = new Prisma.PrismaClientKnownRequestError('timeout', {
        code: 'P2024',
        clientVersion: 'test',
      });
      repository.createMany
        .mockRejectedValueOnce(transient)
        .mockResolvedValueOnce([record()]);

      await expect(service.notify([request()])).resolves.toHaveLength(1);
      expect(repository.createMany).toHaveBeenCalledTimes(2);
    });

    it('does not retry a permanent error', async () => {
      const permanent = new Prisma.PrismaClientKnownRequestError('fk', {
        code: 'P2003',
        clientVersion: 'test',
      });
      repository.createMany.mockRejectedValue(permanent);

      await expect(service.notify([request()])).rejects.toBe(permanent);
      expect(repository.createMany).toHaveBeenCalledTimes(1);
    });

    it('still returns when the unread count push fails', async () => {
      repository.countUnreadMany.mockRejectedValue(new Error('down'));

      await expect(service.notify([request()])).resolves.toHaveLength(1);
    });
  });

  describe('notifySystem', () => {
    it('bypasses preferences entirely', async () => {
      await service.notifySystem(
        1,
        'Password changed',
        'Your password changed',
      );

      expect(repository.findPreferencesMany).not.toHaveBeenCalled();
      expect(repository.createMany).toHaveBeenCalledWith([
        expect.objectContaining({
          type: NotificationType.SYSTEM,
          actorId: null,
          recipientId: 1,
        }),
      ]);
    });
  });

  describe('list', () => {
    it('returns a page with an opaque cursor when more rows exist', async () => {
      const last = record({ id: '00000000-0000-4000-8000-000000000001' });
      repository.findPage.mockResolvedValue({
        rows: [record(), last],
        hasMore: true,
      });

      const page = await service.list(1, { limit: 2 });

      expect(page.hasMore).toBe(true);
      expect(page.nextCursor).toBe(encodeCursor(last));
      expect(page.data[0]).not.toHaveProperty('recipientId');
    });

    it('decodes the cursor and scopes the query to the caller', async () => {
      repository.findPage.mockResolvedValue({ rows: [], hasMore: false });
      const cursor = encodeCursor(record());

      const page = await service.list(7, {
        limit: 5,
        cursor,
        unreadOnly: true,
      });

      expect(repository.findPage).toHaveBeenCalledWith(7, {
        limit: 5,
        cursor: { createdAt: record().createdAt, id: ID },
        unreadOnly: true,
        type: undefined,
      });
      expect(page.nextCursor).toBeNull();
    });
  });

  describe('markRead', () => {
    it('marks, returns the row and pushes the new count', async () => {
      repository.markRead.mockResolvedValue(1);
      repository.findOne.mockResolvedValue(
        record({ isRead: true, readAt: new Date() }),
      );
      repository.countUnread.mockResolvedValue(4);

      const result = await service.markRead(1, ID);

      expect(result.isRead).toBe(true);
      expect(publisher.publishToUser).toHaveBeenCalledWith(
        1,
        NotificationSocketEvent.Read,
        expect.objectContaining({ id: ID, unreadCount: 4 }),
      );
    });

    it('is idempotent and silent for an already-read notification', async () => {
      repository.markRead.mockResolvedValue(0);
      repository.findOne.mockResolvedValue(record({ isRead: true }));

      await service.markRead(1, ID);

      expect(publisher.publishToUser).not.toHaveBeenCalled();
    });

    it("answers 404 for someone else's notification", async () => {
      repository.markRead.mockResolvedValue(0);
      repository.findOne.mockResolvedValue(null);

      await expect(service.markRead(3, ID)).rejects.toThrow(NotFoundException);
      expect(repository.markRead).toHaveBeenCalledWith(3, ID, expect.any(Date));
    });
  });

  describe('markAllRead', () => {
    it('marks in bulk and pushes read-all with the remaining count', async () => {
      repository.markAllRead.mockResolvedValue(5);
      repository.countUnread.mockResolvedValue(0);

      await expect(service.markAllRead(1)).resolves.toEqual({
        updated: 5,
        unreadCount: 0,
      });
      expect(publisher.publishToUser).toHaveBeenCalledWith(
        1,
        NotificationSocketEvent.ReadAll,
        expect.objectContaining({ unreadCount: 0 }),
      );
    });

    it('pushes nothing when there was nothing to mark', async () => {
      repository.markAllRead.mockResolvedValue(0);

      await service.markAllRead(1);

      expect(publisher.publishToUser).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('pushes a new count when an unread notification is deleted', async () => {
      repository.delete.mockResolvedValue({ wasUnread: true });

      await service.remove(1, ID);

      expect(publisher.publishToUser).toHaveBeenCalledWith(
        1,
        NotificationSocketEvent.UnreadCount,
        { count: 1 },
      );
    });

    it('answers 404 when nothing of the caller matched', async () => {
      repository.delete.mockResolvedValue(null);

      await expect(service.remove(1, ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('preferences', () => {
    it('defaults every category to enabled', async () => {
      repository.findPreferences.mockResolvedValue(null);

      await expect(service.getPreferences(1)).resolves.toEqual({
        postReplies: true,
        commentReplies: true,
        mentions: true,
        votes: true,
        directMessages: true,
      });
    });

    it('passes only the known boolean switches to the store', async () => {
      repository.upsertPreferences.mockResolvedValue({
        postReplies: true,
        commentReplies: true,
        mentions: true,
        votes: false,
        directMessages: true,
      });

      await service.updatePreferences(1, {
        votes: false,
        userId: 99,
      } as never);

      expect(repository.upsertPreferences).toHaveBeenCalledWith(1, {
        votes: false,
      });
    });
  });
});
