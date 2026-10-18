import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './notification-cursor';

describe('notification cursor', () => {
  const cursor = {
    createdAt: new Date('2026-10-16T12:00:00.123Z'),
    id: '3f1c0d52-8a0e-4c4e-9d7a-2b1e6f0c9a11',
  };

  it('round-trips', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('is URL safe', () => {
    expect(encodeCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['garbage', 'not-a-cursor'],
    ['a bad date', Buffer.from(`nope|${cursor.id}`).toString('base64url')],
    [
      'a bad id',
      Buffer.from('2026-10-16T12:00:00.000Z|1 OR 1=1').toString('base64url'),
    ],
    ['no separator', Buffer.from('2026-10-16').toString('base64url')],
  ])('rejects %s with 400', (_label, raw) => {
    expect(() => decodeCursor(raw)).toThrow(BadRequestException);
  });
});
