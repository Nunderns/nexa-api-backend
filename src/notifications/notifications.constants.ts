/** Socket.IO namespace of the notification gateway. */
export const NOTIFICATIONS_NAMESPACE = '/notifications';

/**
 * Room every socket of a user joins. Built only from the id the server read
 * out of a verified JWT; clients cannot join rooms themselves.
 */
export const userRoom = (userId: number): string => `user:${userId}`;

/** Server-to-client events. Clients send nothing on this namespace. */
export const NotificationSocketEvent = {
  New: 'notification:new',
  Read: 'notification:read',
  ReadAll: 'notification:read-all',
  UnreadCount: 'notification:unread-count',
} as const;

export const NOTIFICATIONS_DEFAULT_PAGE_SIZE = 20;
export const NOTIFICATIONS_MAX_PAGE_SIZE = 50;

/**
 * Most users a single post or comment can notify through mentions. Further
 * handles are ignored, so one piece of content cannot fan out to an
 * arbitrary number of inboxes.
 */
export const MAX_MENTIONS_PER_CONTENT = 10;

/**
 * Concurrent sockets per user (tabs, devices). Bounds the memory one account
 * can pin on the server.
 */
export const MAX_SOCKETS_PER_USER = 10;

/** Attempts for persisting notifications when the database hiccups. */
export const NOTIFICATION_PERSIST_ATTEMPTS = 3;
