# Notifications: real-time contract

REST endpoints are documented in Swagger under the `notifications` tag (dev
only). This file covers the WebSocket side and the delivery rules both share.

The database is the source of truth. The socket is a low-latency hint: every
event it carries can be recovered over REST, and a client must never rely on
having received it.

## Connecting

| | |
|---|---|
| Transport | Socket.IO 4 |
| Namespace | `/notifications` |
| URL | `<API origin>/notifications`, e.g. `http://localhost:3000/notifications` |
| Auth | The REST access token (JWT), in `auth.token` or an `Authorization: Bearer` header |

```ts
import { io } from 'socket.io-client';

const socket = io(`${API_URL}/notifications`, {
  auth: (cb) => cb({ token: getAccessToken() }), // re-read on every reconnect
  transports: ['websocket'],
});
```

Don't put the token in the query string. Query strings end up in proxy and
access logs, so the server doesn't read them.

### Handshake checks

The server checks these in order. Any failure refuses the connection with
`connect_error`, and `error.message` is one of the values below.

| Check | `error.message` |
|---|---|
| More than `WS_CONNECT_IP_RATE_LIMIT_MAX` attempts per IP per window (default 30/min) | `Too Many Requests` |
| Missing token | `Unauthorized` |
| Invalid signature, malformed or expired token | `Unauthorized` |
| Unknown, inactive or e-mail-unverified account (same rules as REST) | `Unauthorized` |
| User already has `MAX_SOCKETS_PER_USER` (10) sockets on this instance | `Too many connections` |
| Browser `Origin` not in `FRONTEND_URL` | Refused before Socket.IO (generic transport error) |

Requests without an `Origin` header (native apps, server-to-server) skip the
origin check. They still need a valid token.

### Session lifetime

- Every socket of a user joins the server-side room `user:{id}`. The id comes
  from the verified token. Anything the client sends in `auth`, other than the
  token, is ignored.
- When the access token expires, the server disconnects the socket (reason
  `io server disconnect`). Refresh the token and reconnect. Socket.IO doesn't
  auto-reconnect after a server-side disconnect, so call `socket.connect()`.
- Access tokens are stateless, so a deactivated account keeps an already-open
  socket until its token expires, at most one access-token lifetime
  (15 minutes). The next handshake is refused.

### Client-to-server events

There are none. The server registers no handlers on this namespace, so a
client can't join, leave or publish to rooms. Anything a client emits is
ignored. Frames are capped at 4 KB.

## Server-to-client events

All events go only to the recipient's room, which means every open tab or
device of that user and nobody else.

### `notification:new`

A notification was stored. Same shape as an item of `GET /notifications`.

```json
{
  "id": "3f1c0d52-8a0e-4c4e-9d7a-2b1e6f0c9a11",
  "type": "COMMENT_REPLY",
  "title": "New reply",
  "body": "@bob replied to your comment",
  "resourceType": "COMMENT",
  "resourceId": 42,
  "metadata": { "postId": 7, "commentId": 42, "parentId": 40 },
  "isRead": false,
  "readAt": null,
  "createdAt": "2026-10-16T12:00:00.000Z",
  "actor": { "id": 2, "username": "bob", "displayName": "Bob", "avatarUrl": null }
}
```

| `type` | `resourceType` / `resourceId` | `metadata` |
|---|---|---|
| `POST_REPLY` | `COMMENT` / new comment | `postId`, `commentId`, `parentId: null` |
| `COMMENT_REPLY` | `COMMENT` / new reply | `postId`, `commentId`, `parentId` |
| `USER_MENTION` | `COMMENT` or `POST` / where you were mentioned | `postId`, plus `commentId` for a comment |
| `POST_UPVOTE` | `POST` / the post | `postId` |
| `COMMENT_UPVOTE` | `COMMENT` / the comment | `postId`, `commentId` |
| `DIRECT_MESSAGE` | `CHAT` / the chat | `chatId`, `messageId` |
| `SYSTEM` | none | none |

`title` and `body` are plain text built by the server from fixed templates and
the actor's username. They never contain post, comment or message text.
Render them as text, never as HTML. Message content is never included.
Fetch it through `GET /chats/:chatId/messages`, which checks participation.

### `notification:read`

One notification was marked read (from any tab).

```json
{ "id": "3f1c0d52-…", "readAt": "2026-10-16T12:05:00.000Z", "unreadCount": 2 }
```

### `notification:read-all`

All notifications up to `readAt` were marked read.

```json
{ "readAt": "2026-10-16T12:06:00.000Z", "unreadCount": 0 }
```

Notifications created after `readAt` stay unread. Mark items read locally
only if their `createdAt <= readAt`.

### `notification:unread-count`

```json
{ "count": 3 }
```

Sent on connect, after every `notification:new` and after deleting an unread
notification. The value is read from the database, not incremented, so it
corrects any drift. Treat it as authoritative.

## Ordering, idempotency and recovery

- **Persist, then push.** A notification is committed before
  `notification:new` is emitted, so a REST fetch triggered by the event
  always finds it.
- **Stable ids.** `id` is a UUID that never changes. Deduplicate by `id` when
  merging pushes with REST pages; the same notification can arrive by both
  paths.
- **Ordering.** Events for one user are emitted in commit order by one
  process, but nothing is guaranteed across reconnects. Sort by
  `(createdAt, id)` descending, which is the order the API uses.
- **Recovery after a disconnect.** On every `connect`, including reconnects:
  1. Use the `notification:unread-count` the server sends as the badge.
  2. Fetch `GET /notifications` from the start and merge by `id` until you
     reach an id you already have, or follow `nextCursor`. Use
     `?unreadOnly=true` if you only keep unread items.

### Delivery guarantees

| Stage | Guarantee |
|---|---|
| Business write (comment, vote, message…) | Committed independently. A notification failure never fails or rolls it back. |
| Notification row | Created after the write commits, from an in-process domain event. Transient database errors are retried 3 times with backoff. Inserts are idempotent per `(recipient, dedupeKey)`, so retries and duplicate events can't double-notify. |
| Push | Best effort, at most once per connected socket. Missed pushes are recovered over REST. |

**Known limitation: at-most-once creation.** Events live in memory. If the
process dies between the business commit and the notification insert, or the
database stays down through all retries, that notification is lost. The error
is logged with the event name and error code only, never content.

A **transactional outbox** (write an outbox row in the same transaction as the
business write and process it from a relay) would make creation
at-least-once. It isn't implemented yet. Most of the publishing services don't
wrap their writes in transactions today, so an outbox would first mean
restructuring the comments, votes and posts services. For notifications, an
occasional loss on a crash is an acceptable trade. Revisit this if
notifications become contractual (billing, security alerts).

### Horizontal scaling

Rooms, the per-user socket cap and the connection rate limiter are in memory
per process. With one API instance (the current deployment) this is complete.
With several, a user connected to instance A won't receive pushes produced on
instance B. They still get them on the next REST sync. Before scaling out,
add `@socket.io/redis-adapter` (and, if needed, sticky sessions for the
polling transport). Redis isn't introduced now because nothing else in the
project needs it.

## Delivery rules

- **No self-notifications.** You are never notified about your own action.
- **Replies.** A top-level comment notifies the post author (`POST_REPLY`).
  A reply notifies the parent comment's author (`COMMENT_REPLY`), not the post
  author.
- **Mentions.** `@username` with the registration rule (3–30 of
  `[A-Za-z0-9_]`, case sensitive). Repeated handles count once. Unknown,
  inactive, or (in a private community) non-member or banned users are
  ignored. At most 10 users per post or comment.
- **Precedence.** One event, one notification per person. A user who is both
  the reply recipient and mentioned gets the reply only. The same applies
  after edits.
- **Edits.** Editing a post or comment re-evaluates mentions. Users already
  notified for that content are skipped and newly added handles are notified.
  Removing a mention doesn't retract a delivered notification.
- **Votes.** Only a new upvote notifies: a fresh upvote, or flipping a
  downvote to an upvote. Downvotes, removals and re-casting the same vote
  don't. Each voter notifies the author once per post or comment, ever, so
  toggling an upvote can't spam. Removing the vote keeps the notification.
- **Direct messages.** One notification per message for the other
  participant, with ids only.
- **Preferences.** `GET`/`PATCH /notifications/preferences`. A disabled
  category suppresses the notification entirely: it is neither stored nor
  pushed. Re-enabling doesn't backfill. `SYSTEM` notifications have no switch.
- **Deleted content.** `resourceId` has no foreign key. A notification about
  content that was later deleted stays, and opening it resolves to a 404.

## Abuse limits

Abuse is bounded where notifications originate, not only on the notification
endpoints:

| Action | Per-user budget (env, default) |
|---|---|
| Create or edit a comment | `COMMENT_WRITE_RATE_LIMIT_MAX`, 20/min |
| Create or edit a post | `POST_WRITE_RATE_LIMIT_MAX`, 10/min |
| Vote | `VOTE_RATE_LIMIT_MAX`, 60/min |
| Send a message | `CHAT_MESSAGE_RATE_LIMIT_MAX`, 20/min (existing) |
| Update preferences | `NOTIFICATION_PREFERENCES_RATE_LIMIT_MAX`, 10/min |
| Mark all as read | `NOTIFICATION_BULK_RATE_LIMIT_MAX`, 10/min |
| Open a socket (per IP) | `WS_CONNECT_IP_RATE_LIMIT_MAX`, 30/min |

The per-IP `RATE_LIMIT_MAX` budget still applies to every HTTP route.
