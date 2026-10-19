import { Injectable } from '@nestjs/common';
import {
  NotificationPreference,
  NotificationResourceType,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationCursor } from './notification-cursor';

/** Public user fields embedded as `actor`; nothing private ever leaves. */
const actorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

const notificationSelect = {
  id: true,
  recipientId: true,
  type: true,
  title: true,
  body: true,
  resourceType: true,
  resourceId: true,
  metadata: true,
  isRead: true,
  readAt: true,
  createdAt: true,
  actor: { select: actorSelect },
} satisfies Prisma.NotificationSelect;

export type NotificationRecord = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

export interface NewNotification {
  recipientId: number;
  actorId: number | null;
  type: NotificationType;
  title: string;
  body: string;
  resourceType: NotificationResourceType | null;
  resourceId: number | null;
  metadata: Record<string, number | string | null> | null;
  dedupeKey: string | null;
}

export interface NotificationPageQuery {
  limit: number;
  cursor?: NotificationCursor;
  unreadOnly?: boolean;
  type?: NotificationType;
}

export type PreferenceFlags = Pick<
  NotificationPreference,
  'postReplies' | 'commentReplies' | 'mentions' | 'votes' | 'directMessages'
>;

const preferenceSelect = {
  userId: true,
  postReplies: true,
  commentReplies: true,
  mentions: true,
  votes: true,
  directMessages: true,
} satisfies Prisma.NotificationPreferenceSelect;

/**
 * Every Prisma query of the notification feature.
 *
 * Each read and write that targets a single notification is scoped by
 * `recipientId` inside the query itself, never checked afterwards on a loaded
 * row: a notification that belongs to someone else is indistinguishable from
 * one that does not exist, so there is no code path that could act on it.
 */
@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inserts in one statement and returns only the rows that were actually
   * created: a `(recipientId, dedupeKey)` that already exists is skipped by
   * the unique index, which is what makes retries and duplicate events safe.
   */
  createMany(rows: NewNotification[]): Promise<NotificationRecord[]> {
    if (rows.length === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.notification.createManyAndReturn({
      data: rows.map((row) => ({
        ...row,
        metadata: row.metadata ?? Prisma.DbNull,
      })),
      skipDuplicates: true,
      select: notificationSelect,
    });
  }

  /**
   * Newest first, keyset-paginated on `(createdAt, id)`, served by the
   * `(recipient_id, created_at DESC, id DESC)` index. Fetches one row more
   * than asked to know whether another page exists without a COUNT.
   */
  async findPage(
    recipientId: number,
    query: NotificationPageQuery,
  ): Promise<{ rows: NotificationRecord[]; hasMore: boolean }> {
    const where: Prisma.NotificationWhereInput = { recipientId };

    if (query.unreadOnly) {
      where.isRead = false;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.cursor) {
      const { createdAt, id } = query.cursor;
      where.OR = [
        { createdAt: { lt: createdAt } },
        { createdAt, id: { lt: id } },
      ];
    }

    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: notificationSelect,
    });

    const hasMore = rows.length > query.limit;

    return { rows: hasMore ? rows.slice(0, query.limit) : rows, hasMore };
  }

  findOne(recipientId: number, id: string): Promise<NotificationRecord | null> {
    return this.prisma.notification.findFirst({
      where: { id, recipientId },
      select: notificationSelect,
    });
  }

  countUnread(recipientId: number): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientId, isRead: false },
    });
  }

  /** Unread counts for several users in one grouped query. */
  async countUnreadMany(recipientIds: number[]): Promise<Map<number, number>> {
    const counts = new Map(recipientIds.map((id) => [id, 0]));

    if (recipientIds.length === 0) {
      return counts;
    }

    const groups = await this.prisma.notification.groupBy({
      by: ['recipientId'],
      where: { recipientId: { in: recipientIds }, isRead: false },
      _count: { _all: true },
    });

    for (const group of groups) {
      counts.set(group.recipientId, group._count._all);
    }

    return counts;
  }

  /**
   * Marks one notification read. The `isRead: false` filter makes it a no-op
   * on an already-read row, so `readAt` keeps the first read time. Returns
   * the number of rows changed (0 or 1).
   */
  async markRead(recipientId: number, id: string, now: Date): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, recipientId, isRead: false },
      data: { isRead: true, readAt: now },
    });

    return count;
  }

  /**
   * One UPDATE for every unread row of the recipient. Rows created after
   * `upTo` are left alone, so a notification that arrives while the client
   * is clicking "mark all" is not swallowed unseen.
   */
  async markAllRead(recipientId: number, upTo: Date): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { recipientId, isRead: false, createdAt: { lte: upTo } },
      data: { isRead: true, readAt: upTo },
    });

    return count;
  }

  /**
   * Deletes a notification of the recipient. Returns the deleted row's read
   * state, or `null` when there was nothing to delete.
   */
  async delete(
    recipientId: number,
    id: string,
  ): Promise<{ wasUnread: boolean } | null> {
    // One transaction, so the read state reported is the one of the row that
    // was actually deleted.
    const [existing, { count }] = await this.prisma.$transaction([
      this.prisma.notification.findFirst({
        where: { id, recipientId },
        select: { isRead: true },
      }),
      this.prisma.notification.deleteMany({ where: { id, recipientId } }),
    ]);

    return count === 0 || !existing ? null : { wasUnread: !existing.isRead };
  }

  findPreferences(userId: number): Promise<PreferenceFlags | null> {
    return this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: preferenceSelect,
    });
  }

  /** Preferences of several users in one query; missing users have no row. */
  async findPreferencesMany(
    userIds: number[],
  ): Promise<Map<number, PreferenceFlags>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: userIds } },
      select: preferenceSelect,
    });

    return new Map(rows.map((row) => [row.userId, row]));
  }

  upsertPreferences(
    userId: number,
    changes: Partial<PreferenceFlags>,
  ): Promise<PreferenceFlags> {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: changes,
      create: { userId, ...changes },
      select: preferenceSelect,
    });
  }

  /** Usernames of the given users, for notification text. */
  async findUsernames(userIds: number[]): Promise<Map<number, string>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });

    return new Map(users.map((user) => [user.id, user.username]));
  }

  /**
   * Resolves mentioned usernames to active users who are allowed to see the
   * post: anyone for a public community, non-banned members for a private
   * one. A mention can therefore never reveal that a private post exists.
   * Unknown usernames are simply absent from the result.
   */
  async findMentionableUserIds(
    usernames: string[],
    postId: number,
  ): Promise<number[]> {
    if (usernames.length === 0) {
      return [];
    }

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        isDeleted: true,
        community: { select: { id: true, isPrivate: true } },
      },
    });

    if (!post || post.isDeleted) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: {
        username: { in: usernames },
        isActive: true,
        ...(post.community.isPrivate
          ? {
              communityMemberships: {
                some: { communityId: post.community.id, bannedAt: null },
              },
            }
          : {}),
      },
      select: { id: true },
    });

    return users.map((user) => user.id);
  }
}
