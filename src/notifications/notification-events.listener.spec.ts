import { NotificationType } from '@prisma/client';
import {
  CommentCreatedEvent,
  CommentUpdatedEvent,
  MessageSentEvent,
  PostCreatedEvent,
  VoteCastEvent,
} from '../common/events/domain-events';
import { NotificationEventsListener } from './notification-events.listener';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService, NotifyRequest } from './notifications.service';

const POST_AUTHOR = 1;
const COMMENTER = 2;
const PARENT_AUTHOR = 3;
const CAROL = 4;

describe('NotificationEventsListener', () => {
  let notify: jest.Mock<Promise<unknown>, [NotifyRequest[]]>;
  let findMentionableUserIds: jest.Mock;
  let listener: NotificationEventsListener;

  /** Users the fake directory knows, by username. */
  const directory: Record<string, number> = {
    alice: POST_AUTHOR,
    bob: COMMENTER,
    dave: PARENT_AUTHOR,
    carol: CAROL,
  };

  const sent = (): NotifyRequest[] => notify.mock.calls.flatMap((c) => c[0]);

  beforeEach(() => {
    notify = jest.fn().mockResolvedValue([]);
    findMentionableUserIds = jest.fn((usernames: string[]) =>
      Promise.resolve(
        usernames
          .map((username) => directory[username])
          .filter((id) => id !== undefined),
      ),
    );
    listener = new NotificationEventsListener(
      { notify } as unknown as NotificationsService,
      { findMentionableUserIds } as unknown as NotificationsRepository,
    );
  });

  describe('comment created', () => {
    it('notifies the post author of a top-level comment', async () => {
      await listener.onCommentCreated(
        new CommentCreatedEvent(
          10,
          7,
          COMMENTER,
          'nice',
          POST_AUTHOR,
          null,
          null,
        ),
      );

      expect(sent()).toEqual([
        expect.objectContaining({
          recipientId: POST_AUTHOR,
          actorId: COMMENTER,
          type: NotificationType.POST_REPLY,
          resourceType: 'COMMENT',
          resourceId: 10,
          metadata: { postId: 7, commentId: 10, parentId: null },
          dedupeKey: 'comment:10:reply',
        }),
      ]);
    });

    it('notifies the parent author (not the post author) of a reply', async () => {
      await listener.onCommentCreated(
        new CommentCreatedEvent(
          11,
          7,
          COMMENTER,
          'agree',
          POST_AUTHOR,
          10,
          PARENT_AUTHOR,
        ),
      );

      expect(sent()).toEqual([
        expect.objectContaining({
          recipientId: PARENT_AUTHOR,
          type: NotificationType.COMMENT_REPLY,
        }),
      ]);
    });

    it('adds mentions, deduplicated, without the author', async () => {
      await listener.onCommentCreated(
        new CommentCreatedEvent(
          10,
          7,
          COMMENTER,
          '@carol @carol @bob @ghost',
          POST_AUTHOR,
          null,
          null,
        ),
      );

      const mentions = sent().filter(
        (r) => r.type === NotificationType.USER_MENTION,
      );
      expect(mentions).toEqual([
        expect.objectContaining({
          recipientId: CAROL,
          dedupeKey: 'mention:comment:10',
        }),
      ]);
      expect(findMentionableUserIds).toHaveBeenCalledWith(
        ['carol', 'bob', 'ghost'],
        7,
      );
    });

    it('gives the reply precedence over a mention of the same user', async () => {
      await listener.onCommentCreated(
        new CommentCreatedEvent(
          10,
          7,
          COMMENTER,
          'thanks @alice',
          POST_AUTHOR,
          null,
          null,
        ),
      );

      expect(sent()).toHaveLength(1);
      expect(sent()[0]).toMatchObject({
        recipientId: POST_AUTHOR,
        type: NotificationType.POST_REPLY,
      });
    });

    it('swallows failures so the comment request is unaffected', async () => {
      notify.mockRejectedValue(new Error('db down'));

      await expect(
        listener.onCommentCreated(
          new CommentCreatedEvent(
            10,
            7,
            COMMENTER,
            'x',
            POST_AUTHOR,
            null,
            null,
          ),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('comment updated', () => {
    it('re-evaluates mentions with the same dedupe key and keeps reply precedence', async () => {
      await listener.onCommentUpdated(
        new CommentUpdatedEvent(10, 7, COMMENTER, '@alice @carol', POST_AUTHOR),
      );

      expect(sent()).toEqual([
        expect.objectContaining({
          recipientId: CAROL,
          type: NotificationType.USER_MENTION,
          dedupeKey: 'mention:comment:10',
        }),
      ]);
    });
  });

  describe('post created', () => {
    it('notifies users mentioned in the title or body', async () => {
      await listener.onPostCreated(
        new PostCreatedEvent(7, POST_AUTHOR, 'Hey @carol', 'and @alice'),
      );

      expect(sent()).toEqual([
        expect.objectContaining({
          recipientId: CAROL,
          resourceType: 'POST',
          resourceId: 7,
          dedupeKey: 'mention:post:7',
        }),
      ]);
    });
  });

  describe('vote cast', () => {
    it.each([
      [0, 1],
      [-1, 1],
    ])('notifies on an upvote (previous %i)', async (previous, vote) => {
      await listener.onVoteCast(
        new VoteCastEvent('POST', 7, 7, COMMENTER, POST_AUTHOR, previous, vote),
      );

      expect(sent()).toEqual([
        expect.objectContaining({
          recipientId: POST_AUTHOR,
          type: NotificationType.POST_UPVOTE,
          dedupeKey: `vote:post:7:user:${COMMENTER}`,
        }),
      ]);
    });

    it.each([
      ['a downvote', 0, -1],
      ['a removal', 1, 0],
      ['a flip to downvote', 1, -1],
    ])('ignores %s', async (_label, previous, vote) => {
      await listener.onVoteCast(
        new VoteCastEvent('POST', 7, 7, COMMENTER, POST_AUTHOR, previous, vote),
      );

      expect(notify).not.toHaveBeenCalled();
    });

    it('references the comment and its post for a comment upvote', async () => {
      await listener.onVoteCast(
        new VoteCastEvent('COMMENT', 10, 7, COMMENTER, POST_AUTHOR, 0, 1),
      );

      expect(sent()[0]).toMatchObject({
        type: NotificationType.COMMENT_UPVOTE,
        resourceType: 'COMMENT',
        resourceId: 10,
        metadata: { postId: 7, commentId: 10 },
        dedupeKey: `vote:comment:10:user:${COMMENTER}`,
      });
    });
  });

  describe('message sent', () => {
    it('notifies the recipient with ids only', async () => {
      await listener.onMessageSent(
        new MessageSentEvent(55, 9, COMMENTER, CAROL),
      );

      expect(sent()).toEqual([
        {
          recipientId: CAROL,
          actorId: COMMENTER,
          type: NotificationType.DIRECT_MESSAGE,
          resourceType: 'CHAT',
          resourceId: 9,
          metadata: { chatId: 9, messageId: 55 },
          dedupeKey: 'message:55',
        },
      ]);
    });
  });
});
