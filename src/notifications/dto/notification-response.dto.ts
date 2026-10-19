import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationResourceType, NotificationType } from '@prisma/client';

export class NotificationActorDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 'bob' })
  username: string;

  @ApiProperty({ example: 'Bob' })
  displayName: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  avatarUrl: string | null;
}

/**
 * A notification as returned by the REST API and pushed over the
 * `notification:new` WebSocket event (same shape in both places, so a client
 * can merge them by `id`).
 */
export class NotificationResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f1c0d52-8a0e-4c4e-9d7a-2b1e6f0c9a11',
    description: 'Stable identifier; use it to deduplicate pushes and pages.',
  })
  id: string;

  @ApiProperty({
    enum: NotificationType,
    example: NotificationType.COMMENT_REPLY,
  })
  type: NotificationType;

  @ApiProperty({
    example: 'New reply',
    description: 'Plain text, never HTML. Render as text.',
  })
  title: string;

  @ApiProperty({
    example: '@bob replied to your comment',
    description: 'Plain text, never HTML. Render as text.',
  })
  body: string;

  @ApiProperty({
    enum: NotificationResourceType,
    nullable: true,
    example: NotificationResourceType.COMMENT,
  })
  resourceType: NotificationResourceType | null;

  @ApiProperty({ type: Number, nullable: true, example: 42 })
  resourceId: number | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    example: { postId: 7, commentId: 42, parentId: 40 },
    description:
      'Identifiers that help the client navigate (postId, commentId, chatId, ' +
      'messageId). Never contains message or comment text.',
  })
  metadata: Record<string, unknown> | null;

  @ApiProperty({ example: false })
  isRead: boolean;

  @ApiProperty({ type: Date, nullable: true, example: null })
  readAt: Date | null;

  @ApiProperty({ example: '2026-10-16T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ type: NotificationActorDto, nullable: true })
  actor: NotificationActorDto | null;
}

export class NotificationPageDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  data: NotificationResponseDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'MjAyNi0xMC0xNlQxMjowMDowMC4wMDBafDNmMWMwZDUy',
    description:
      'Pass as `cursor` to fetch the next (older) page. Null on the last page.',
  })
  nextCursor: string | null;

  @ApiProperty({ example: true })
  hasMore: boolean;
}

export class UnreadCountDto {
  @ApiProperty({ example: 3 })
  count: number;
}

export class MarkAllReadResponseDto {
  @ApiProperty({ example: 5, description: 'Notifications marked as read.' })
  updated: number;

  @ApiProperty({ example: 0 })
  unreadCount: number;
}
