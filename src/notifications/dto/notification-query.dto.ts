import { ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  NOTIFICATIONS_DEFAULT_PAGE_SIZE,
  NOTIFICATIONS_MAX_PAGE_SIZE,
} from '../notifications.constants';

/**
 * Query strings arrive as text and the global pipe converts implicitly, which
 * would turn `"false"` into `true`. Only the literal strings are accepted.
 */
const toBoolean = ({
  obj,
  key,
}: {
  obj: Record<string, unknown>;
  key: string;
}) => {
  const raw = obj[key];

  if (raw === 'true' || raw === true) return true;
  if (raw === 'false' || raw === false) return false;

  return raw;
};

export class NotificationQueryDto {
  @ApiPropertyOptional({
    default: NOTIFICATIONS_DEFAULT_PAGE_SIZE,
    minimum: 1,
    maximum: NOTIFICATIONS_MAX_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTIFICATIONS_MAX_PAGE_SIZE)
  limit?: number = NOTIFICATIONS_DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({
    description:
      '`nextCursor` from the previous page. Omit for the first page.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'cursor is malformed' })
  cursor?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Only unread notifications.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unreadOnly?: boolean = false;

  @ApiPropertyOptional({
    enum: NotificationType,
    description: 'Filter by type.',
  })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}
