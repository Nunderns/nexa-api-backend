/**
 * Domain events published by the content and chat services once their own
 * write has succeeded.
 *
 * They are the only coupling between those services and the notification
 * feature: publishers do not know who listens, and listeners never import the
 * publishing modules, so neither side can create a circular dependency.
 *
 * Delivery is in-process and fire-and-forget (see `DomainEventsModule`): a
 * failing listener is logged and never fails the request that emitted the
 * event. Payloads carry identifiers plus whatever the publisher already had in
 * hand, so a listener can usually act without re-reading the rows.
 */

export const DomainEvent = {
  CommentCreated: 'comment.created',
  CommentUpdated: 'comment.updated',
  PostCreated: 'post.created',
  PostUpdated: 'post.updated',
  VoteCast: 'vote.cast',
  MessageSent: 'message.sent',
} as const;

export type DomainEventName = (typeof DomainEvent)[keyof typeof DomainEvent];

export class CommentCreatedEvent {
  constructor(
    readonly commentId: number,
    readonly postId: number,
    readonly authorId: number,
    readonly content: string,
    readonly postAuthorId: number,
    /** Set when the comment is a reply. */
    readonly parentId: number | null,
    readonly parentAuthorId: number | null,
  ) {}
}

export class CommentUpdatedEvent {
  constructor(
    readonly commentId: number,
    readonly postId: number,
    readonly authorId: number,
    readonly content: string,
    /** Whoever the original comment notified as a reply, if anyone. */
    readonly replyRecipientId: number | null,
  ) {}
}

export class PostCreatedEvent {
  constructor(
    readonly postId: number,
    readonly authorId: number,
    readonly title: string,
    readonly content: string | null,
  ) {}
}

export class PostUpdatedEvent {
  constructor(
    readonly postId: number,
    readonly authorId: number,
    readonly title: string,
    readonly content: string | null,
  ) {}
}

export type VoteTargetType = 'POST' | 'COMMENT';

export class VoteCastEvent {
  constructor(
    readonly targetType: VoteTargetType,
    readonly targetId: number,
    /** Post the target belongs to (the post itself for a post vote). */
    readonly postId: number,
    readonly voterId: number,
    readonly targetAuthorId: number,
    /** `0` when the voter had no vote before. */
    readonly previousVote: number,
    /** `0` when the vote was removed. */
    readonly vote: number,
  ) {}
}

/**
 * Deliberately carries no message content: nothing downstream of the chat
 * service needs it, and keeping it out of the event keeps it out of every
 * listener, log line and notification row by construction.
 */
export class MessageSentEvent {
  constructor(
    readonly messageId: number,
    readonly chatId: number,
    readonly senderId: number,
    readonly recipientId: number,
  ) {}
}
