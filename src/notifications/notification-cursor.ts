import { BadRequestException } from '@nestjs/common';

/** Position in the `(createdAt DESC, id DESC)` order of a recipient's list. */
export interface NotificationCursor {
  createdAt: Date;
  id: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opaque to clients: base64url of `<ISO timestamp>|<uuid>`. Encoding both
 * columns keeps the order stable when several rows share a timestamp, and
 * makes paging immune to rows inserted at the head of the list in between
 * requests (unlike an offset).
 */
export function encodeCursor(cursor: NotificationCursor): string {
  return Buffer.from(
    `${cursor.createdAt.toISOString()}|${cursor.id}`,
    'utf8',
  ).toString('base64url');
}

export function decodeCursor(raw: string): NotificationCursor {
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  const separator = decoded.indexOf('|');
  const createdAt = new Date(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);

  if (
    separator === -1 ||
    Number.isNaN(createdAt.getTime()) ||
    !UUID_PATTERN.test(id)
  ) {
    throw new BadRequestException('Invalid cursor');
  }

  return { createdAt, id };
}
