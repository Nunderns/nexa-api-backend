import { NotificationType } from '@prisma/client';
import { notificationText } from './notification-templates';

describe('notificationText', () => {
  it.each([
    [NotificationType.POST_REPLY, 'New comment', '@bob commented on your post'],
    [
      NotificationType.COMMENT_REPLY,
      'New reply',
      '@bob replied to your comment',
    ],
    [NotificationType.USER_MENTION, 'New mention', '@bob mentioned you'],
    [NotificationType.POST_UPVOTE, 'New upvote', '@bob upvoted your post'],
    [
      NotificationType.COMMENT_UPVOTE,
      'New upvote',
      '@bob upvoted your comment',
    ],
    [NotificationType.DIRECT_MESSAGE, 'New message', '@bob sent you a message'],
  ] as const)('%s', (type, title, body) => {
    expect(notificationText(type, 'bob')).toEqual({ title, body });
  });

  it('says "Someone" once the actor is gone', () => {
    expect(notificationText(NotificationType.POST_UPVOTE, null).body).toBe(
      'Someone upvoted your post',
    );
  });
});
