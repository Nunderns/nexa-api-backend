import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NotificationResourceType,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { decodeCursor, encodeCursor } from './notification-cursor';
import { NotificationPublisher } from './notification-publisher';
import { notificationText } from './notification-templates';
import {
  NOTIFICATIONS_DEFAULT_PAGE_SIZE,
  NOTIFICATION_PERSIST_ATTEMPTS,
  NotificationSocketEvent,
} from './notifications.constants';
import {
  NewNotification,
  NotificationRecord,
  NotificationsRepository,
  PreferenceFlags,
} from './notifications.repository';
import {
  MarkAllReadResponseDto,
  NotificationPageDto,
  NotificationResponseDto,
  UnreadCountDto,
} from './dto/notification-response.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  NotificationPreferencesDto,
  UpdatePreferencesDto,
} from './dto/update-preferences.dto';

export type UserNotificationType = Exclude<NotificationType, 'SYSTEM'>;

/** One notification an event wants to send, before rules are applied. */
export interface NotifyRequest {
  recipientId: number;
  actorId: number;
  type: UserNotificationType;
  resourceType: NotificationResourceType;
  resourceId: number;
  metadata: Record<string, number | null>;
  /** Idempotency key, unique per recipient. See `Notification.dedupeKey`. */
  dedupeKey: string;
}

const DEFAULT_PREFERENCES: PreferenceFlags = {
  postReplies: true,
  commentReplies: true,
  mentions: true,
  votes: true,
  directMessages: true,
};

/** Which preference switch governs each user-triggered type. */
const PREFERENCE_FOR_TYPE: Record<UserNotificationType, keyof PreferenceFlags> =
  {
    POST_REPLY: 'postReplies',
    COMMENT_REPLY: 'commentReplies',
    USER_MENTION: 'mentions',
    POST_UPVOTE: 'votes',
    COMMENT_UPVOTE: 'votes',
    DIRECT_MESSAGE: 'directMessages',
  };

/**
 * Prisma error codes worth retrying: connection loss, timeouts, pool
 * exhaustion and serialization/deadlock conflicts. Anything else (a
 * constraint violation, a bad query) would fail the same way again.
 */
const TRANSIENT_PRISMA_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
  'P2034',
]);

const RETRY_BASE_DELAY_MS = 50;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly repository: NotificationsRepository,
    private readonly publisher: NotificationPublisher,
  ) {}

  /**
   * Applies the delivery rules, persists, then pushes.
   *
   * Rules, in order:
   * 1. Nobody is notified about their own action.
   * 2. A recipient who disabled the category gets nothing, neither a stored
   *    row nor a push.
   * 3. A `(recipient, dedupeKey)` that already exists is skipped by the
   *    database, so a duplicated event, a retry or an edit that keeps a
   *    mention never notifies twice.
   *
   * Persistence happens before any push, so a client that receives
   * `notification:new` can always find the row over REST. Returns the
   * notifications that were actually created.
   */
  async notify(requests: NotifyRequest[]): Promise<NotificationResponseDto[]> {
    const candidates = this.uniqueByRecipientAndKey(
      requests.filter((request) => request.recipientId !== request.actorId),
    );

    if (candidates.length === 0) {
      return [];
    }

    const recipientIds = [...new Set(candidates.map((c) => c.recipientId))];
    const actorIds = [...new Set(candidates.map((c) => c.actorId))];

    const [preferences, usernames] = await Promise.all([
      this.repository.findPreferencesMany(recipientIds),
      this.repository.findUsernames(actorIds),
    ]);

    const rows: NewNotification[] = candidates
      .filter((candidate) => {
        const flags =
          preferences.get(candidate.recipientId) ?? DEFAULT_PREFERENCES;

        return flags[PREFERENCE_FOR_TYPE[candidate.type]];
      })
      .map((candidate) => ({
        ...candidate,
        ...notificationText(
          candidate.type,
          usernames.get(candidate.actorId) ?? null,
        ),
      }));

    const created = await this.withRetry(() =>
      this.repository.createMany(rows),
    );

    await this.publishCreated(created);

    return created.map((record) => this.toDto(record));
  }

  /**
   * System notification (security notices, policy changes). Not subject to
   * preferences: there is deliberately no switch that silences it. Title and
   * body come from server code only, never from user input.
   */
  async notifySystem(
    recipientId: number,
    title: string,
    body: string,
    dedupeKey: string | null = null,
  ): Promise<NotificationResponseDto | null> {
    const [created] = await this.withRetry(() =>
      this.repository.createMany([
        {
          recipientId,
          actorId: null,
          type: NotificationType.SYSTEM,
          title,
          body,
          resourceType: null,
          resourceId: null,
          metadata: null,
          dedupeKey,
        },
      ]),
    );

    if (!created) {
      return null;
    }

    await this.publishCreated([created]);

    return this.toDto(created);
  }

  async list(
    userId: number,
    query: NotificationQueryDto,
  ): Promise<NotificationPageDto> {
    const { rows, hasMore } = await this.repository.findPage(userId, {
      limit: query.limit ?? NOTIFICATIONS_DEFAULT_PAGE_SIZE,
      cursor: query.cursor ? decodeCursor(query.cursor) : undefined,
      unreadOnly: query.unreadOnly,
      type: query.type,
    });

    const last = rows.at(-1);

    return {
      data: rows.map((row) => this.toDto(row)),
      nextCursor: hasMore && last ? encodeCursor(last) : null,
      hasMore,
    };
  }

  async unreadCount(userId: number): Promise<UnreadCountDto> {
    return { count: await this.repository.countUnread(userId) };
  }

  /**
   * Idempotent: marking an already-read notification returns it unchanged.
   * Someone else's notification is a 404, the same as an unknown id.
   */
  async markRead(userId: number, id: string): Promise<NotificationResponseDto> {
    const changed = await this.repository.markRead(userId, id, new Date());
    const notification = await this.repository.findOne(userId, id);

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (changed > 0) {
      const unreadCount = await this.repository.countUnread(userId);
      this.publisher.publishToUser(userId, NotificationSocketEvent.Read, {
        id,
        readAt: notification.readAt,
        unreadCount,
      });
    }

    return this.toDto(notification);
  }

  async markAllRead(userId: number): Promise<MarkAllReadResponseDto> {
    const readAt = new Date();
    const updated = await this.repository.markAllRead(userId, readAt);
    const unreadCount = await this.repository.countUnread(userId);

    if (updated > 0) {
      this.publisher.publishToUser(userId, NotificationSocketEvent.ReadAll, {
        readAt,
        unreadCount,
      });
    }

    return { updated, unreadCount };
  }

  async remove(userId: number, id: string): Promise<void> {
    const deleted = await this.repository.delete(userId, id);

    if (!deleted) {
      throw new NotFoundException('Notification not found');
    }

    if (deleted.wasUnread) {
      await this.publishUnreadCounts([userId]);
    }
  }

  async getPreferences(userId: number): Promise<NotificationPreferencesDto> {
    const stored = await this.repository.findPreferences(userId);

    return this.toPreferencesDto(stored ?? DEFAULT_PREFERENCES);
  }

  async updatePreferences(
    userId: number,
    changes: UpdatePreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    // Copied field by field so nothing beyond the five switches can reach
    // the upsert, whatever the DTO grows into.
    const update: Partial<PreferenceFlags> = {};

    for (const key of Object.keys(
      DEFAULT_PREFERENCES,
    ) as (keyof PreferenceFlags)[]) {
      const value = changes[key];

      if (typeof value === 'boolean') {
        update[key] = value;
      }
    }

    const stored = await this.repository.upsertPreferences(userId, update);

    return this.toPreferencesDto(stored);
  }

  /** Pushes each new notification, then one fresh unread count per user. */
  private async publishCreated(created: NotificationRecord[]): Promise<void> {
    if (created.length === 0) {
      return;
    }

    for (const record of created) {
      this.publisher.publishToUser(
        record.recipientId,
        NotificationSocketEvent.New,
        this.toDto(record),
      );
    }

    await this.publishUnreadCounts([
      ...new Set(created.map((record) => record.recipientId)),
    ]);
  }

  /**
   * The count is read back from the database rather than incremented on the
   * client, so concurrent tabs and missed events self-correct on every push.
   * A failure here only costs a stale badge until the next sync.
   */
  private async publishUnreadCounts(userIds: number[]): Promise<void> {
    try {
      const counts = await this.repository.countUnreadMany(userIds);

      for (const [userId, count] of counts) {
        this.publisher.publishToUser(
          userId,
          NotificationSocketEvent.UnreadCount,
          { count },
        );
      }
    } catch (error) {
      this.logger.warn({
        msg: 'Failed to publish unread counts',
        users: userIds.length,
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  private uniqueByRecipientAndKey(requests: NotifyRequest[]): NotifyRequest[] {
    const seen = new Set<string>();

    return requests.filter((request) => {
      const key = `${request.recipientId}|${request.dedupeKey}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  /**
   * Retries transient database failures with exponential backoff. Safe
   * because inserts are idempotent on `(recipientId, dedupeKey)`: a retry
   * after a write that did commit inserts nothing.
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (
          attempt >= NOTIFICATION_PERSIST_ATTEMPTS ||
          !this.isTransient(error)
        ) {
          throw error;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_BASE_DELAY_MS * 4 ** (attempt - 1)),
        );
      }
    }
  }

  private isTransient(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientInitializationError ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        TRANSIENT_PRISMA_CODES.has(error.code))
    );
  }

  private toDto(record: NotificationRecord): NotificationResponseDto {
    return {
      id: record.id,
      type: record.type,
      title: record.title,
      body: record.body,
      resourceType: record.resourceType,
      resourceId: record.resourceId,
      metadata: (record.metadata as Record<string, unknown> | null) ?? null,
      isRead: record.isRead,
      readAt: record.readAt,
      createdAt: record.createdAt,
      actor: record.actor,
    };
  }

  private toPreferencesDto(flags: PreferenceFlags): NotificationPreferencesDto {
    return {
      postReplies: flags.postReplies,
      commentReplies: flags.commentReplies,
      mentions: flags.mentions,
      votes: flags.votes,
      directMessages: flags.directMessages,
    };
  }
}
