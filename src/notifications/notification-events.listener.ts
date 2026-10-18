import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationResourceType, NotificationType } from '@prisma/client';
import {
  CommentCreatedEvent,
  CommentUpdatedEvent,
  DomainEvent,
  MessageSentEvent,
  PostCreatedEvent,
  PostUpdatedEvent,
  VoteCastEvent,
} from '../common/events/domain-events';
import { extractMentions } from './mentions';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService, NotifyRequest } from './notifications.service';

/**
 * Async, non-blocking listeners: `emit` returns to the publishing service at
 * once, and the listener's promise is detached from the HTTP request.
 */
const LISTENER_OPTIONS = { async: true, promisify: true } as const;

/**
 * Translates domain events into notifications.
 *
 * Every handler swallows and logs its own errors. The business write that
 * emitted the event has already committed, and it must not be reported as
 * failed because a notification could not be created.
 *
 * Precedence: a user who is both the reply recipient and mentioned in the
 * same comment gets the reply notification only. The reply is the more
 * specific signal, and one event should never produce two notifications for
 * the same person. Edits keep honouring this, since the reply recipient is
 * carried on the update event.
 */
@Injectable()
export class NotificationEventsListener {
  private readonly logger = new Logger(NotificationEventsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly repository: NotificationsRepository,
  ) {}

  @OnEvent(DomainEvent.CommentCreated, LISTENER_OPTIONS)
  async onCommentCreated(event: CommentCreatedEvent): Promise<void> {
    await this.safely(DomainEvent.CommentCreated, async () => {
      const isReply = event.parentAuthorId !== null;
      const replyRecipientId = event.parentAuthorId ?? event.postAuthorId;

      const reply: NotifyRequest = {
        recipientId: replyRecipientId,
        actorId: event.authorId,
        type: isReply
          ? NotificationType.COMMENT_REPLY
          : NotificationType.POST_REPLY,
        resourceType: NotificationResourceType.COMMENT,
        resourceId: event.commentId,
        metadata: {
          postId: event.postId,
          commentId: event.commentId,
          parentId: event.parentId,
        },
        dedupeKey: `comment:${event.commentId}:reply`,
      };

      const mentions = await this.commentMentions(
        event.commentId,
        event.postId,
        event.authorId,
        event.content,
        replyRecipientId,
      );

      await this.notifications.notify([reply, ...mentions]);
    });
  }

  /**
   * Only mentions are re-evaluated on edit. The dedupe key is the same as on
   * creation, so users who were already mentioned are skipped and only newly
   * added handles are notified. Removing a mention does not retract the
   * notification already delivered.
   */
  @OnEvent(DomainEvent.CommentUpdated, LISTENER_OPTIONS)
  async onCommentUpdated(event: CommentUpdatedEvent): Promise<void> {
    await this.safely(DomainEvent.CommentUpdated, async () => {
      const mentions = await this.commentMentions(
        event.commentId,
        event.postId,
        event.authorId,
        event.content,
        event.replyRecipientId,
      );

      await this.notifications.notify(mentions);
    });
  }

  @OnEvent(DomainEvent.PostCreated, LISTENER_OPTIONS)
  async onPostCreated(event: PostCreatedEvent): Promise<void> {
    await this.safely(DomainEvent.PostCreated, () => this.postMentions(event));
  }

  @OnEvent(DomainEvent.PostUpdated, LISTENER_OPTIONS)
  async onPostUpdated(event: PostUpdatedEvent): Promise<void> {
    await this.safely(DomainEvent.PostUpdated, () => this.postMentions(event));
  }

  /**
   * Only a new upvote notifies: casting one, or flipping a downvote to an
   * upvote. Downvotes, removals and re-casting the same vote never do.
   *
   * The dedupe key is per voter and target with no time component, which is
   * the cooldown: toggling an upvote off and on again notifies the author
   * once, ever. Removing the vote leaves the notification in place, since the
   * upvote did happen.
   */
  @OnEvent(DomainEvent.VoteCast, LISTENER_OPTIONS)
  async onVoteCast(event: VoteCastEvent): Promise<void> {
    if (event.vote !== 1 || event.previousVote === 1) {
      return;
    }

    await this.safely(DomainEvent.VoteCast, async () => {
      const isPost = event.targetType === 'POST';

      await this.notifications.notify([
        {
          recipientId: event.targetAuthorId,
          actorId: event.voterId,
          type: isPost
            ? NotificationType.POST_UPVOTE
            : NotificationType.COMMENT_UPVOTE,
          resourceType: isPost
            ? NotificationResourceType.POST
            : NotificationResourceType.COMMENT,
          resourceId: event.targetId,
          metadata: isPost
            ? { postId: event.postId }
            : { postId: event.postId, commentId: event.targetId },
          dedupeKey: `vote:${isPost ? 'post' : 'comment'}:${event.targetId}:user:${event.voterId}`,
        },
      ]);
    });
  }

  /**
   * One notification per message. The event carries no content and neither
   * does the notification: only the chat and message ids, so the client
   * fetches the message through the participant-scoped chat endpoint.
   */
  @OnEvent(DomainEvent.MessageSent, LISTENER_OPTIONS)
  async onMessageSent(event: MessageSentEvent): Promise<void> {
    await this.safely(DomainEvent.MessageSent, async () => {
      await this.notifications.notify([
        {
          recipientId: event.recipientId,
          actorId: event.senderId,
          type: NotificationType.DIRECT_MESSAGE,
          resourceType: NotificationResourceType.CHAT,
          resourceId: event.chatId,
          metadata: { chatId: event.chatId, messageId: event.messageId },
          dedupeKey: `message:${event.messageId}`,
        },
      ]);
    });
  }

  private async commentMentions(
    commentId: number,
    postId: number,
    authorId: number,
    content: string,
    replyRecipientId: number | null,
  ): Promise<NotifyRequest[]> {
    const userIds = await this.repository.findMentionableUserIds(
      extractMentions(content),
      postId,
    );

    return userIds
      .filter((id) => id !== authorId && id !== replyRecipientId)
      .map((recipientId) => ({
        recipientId,
        actorId: authorId,
        type: NotificationType.USER_MENTION,
        resourceType: NotificationResourceType.COMMENT,
        resourceId: commentId,
        metadata: { postId, commentId },
        dedupeKey: `mention:comment:${commentId}`,
      }));
  }

  private async postMentions(
    event: PostCreatedEvent | PostUpdatedEvent,
  ): Promise<void> {
    const userIds = await this.repository.findMentionableUserIds(
      extractMentions(event.title, event.content),
      event.postId,
    );

    await this.notifications.notify(
      userIds
        .filter((id) => id !== event.authorId)
        .map((recipientId) => ({
          recipientId,
          actorId: event.authorId,
          type: NotificationType.USER_MENTION,
          resourceType: NotificationResourceType.POST,
          resourceId: event.postId,
          metadata: { postId: event.postId },
          dedupeKey: `mention:post:${event.postId}`,
        })),
    );
  }

  /**
   * Logs with identifiers only. Event payloads may hold user content
   * (comment text), so neither the event nor the raw error message, which
   * can echo query parameters, is ever logged.
   */
  private async safely(
    event: string,
    handler: () => Promise<void>,
  ): Promise<void> {
    try {
      await handler();
    } catch (error) {
      this.logger.error({
        msg: 'Notification handler failed',
        event,
        error: error instanceof Error ? error.name : 'unknown',
        code:
          typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : undefined,
      });
    }
  }
}
