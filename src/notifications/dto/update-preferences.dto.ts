import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * The global pipe converts implicitly, so `"no"` or `1` would otherwise
 * become `true`. Restoring the raw value lets `@IsBoolean` reject anything
 * that is not a JSON boolean.
 */
const raw = ({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
  obj[key];

/**
 * Partial update: omitted categories keep their current value. Unknown
 * properties are rejected by the global pipe (`forbidNonWhitelisted`).
 */
export class UpdatePreferencesDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(raw)
  @IsBoolean()
  postReplies?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(raw)
  @IsBoolean()
  commentReplies?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(raw)
  @IsBoolean()
  mentions?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(raw)
  @IsBoolean()
  votes?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(raw)
  @IsBoolean()
  directMessages?: boolean;
}

/**
 * A disabled category suppresses the notification entirely: it is neither
 * stored nor pushed. `SYSTEM` notifications are not configurable.
 */
export class NotificationPreferencesDto {
  @ApiProperty({ example: true, description: 'Comments on your posts' })
  postReplies: boolean;

  @ApiProperty({ example: true, description: 'Replies to your comments' })
  commentReplies: boolean;

  @ApiProperty({ example: true, description: '@username mentions' })
  mentions: boolean;

  @ApiProperty({ example: false, description: 'Upvotes on posts and comments' })
  votes: boolean;

  @ApiProperty({ example: true, description: 'New direct messages' })
  directMessages: boolean;
}
