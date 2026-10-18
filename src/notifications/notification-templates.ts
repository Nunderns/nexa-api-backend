import { NotificationType } from '@prisma/client';

interface NotificationText {
  title: string;
  body: string;
}

/**
 * Human-readable text for each notification type.
 *
 * Built only from fixed strings and the actor's username, which registration
 * restricts to `[A-Za-z0-9_]`. No post title, comment or message text is ever
 * interpolated, so a notification cannot carry markup or leak private content
 * however a client renders it.
 */
export function notificationText(
  type: Exclude<NotificationType, 'SYSTEM'>,
  actorUsername: string | null,
): NotificationText {
  const actor = actorUsername ? `@${actorUsername}` : 'Someone';

  switch (type) {
    case NotificationType.POST_REPLY:
      return { title: 'New comment', body: `${actor} commented on your post` };
    case NotificationType.COMMENT_REPLY:
      return { title: 'New reply', body: `${actor} replied to your comment` };
    case NotificationType.USER_MENTION:
      return { title: 'New mention', body: `${actor} mentioned you` };
    case NotificationType.POST_UPVOTE:
      return { title: 'New upvote', body: `${actor} upvoted your post` };
    case NotificationType.COMMENT_UPVOTE:
      return { title: 'New upvote', body: `${actor} upvoted your comment` };
    case NotificationType.DIRECT_MESSAGE:
      return { title: 'New message', body: `${actor} sent you a message` };
  }
}
