import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { MESSAGE_MAX_LENGTH, MESSAGE_MIN_LENGTH } from '../chat.constants';

/**
 * Body of `POST /chats/:chatId/messages`.
 *
 * The sender and the chat are both taken from the route/authentication
 * context, so this DTO carries the message content and nothing else. The
 * surrounding validation pipe rejects unknown properties, which is what stops
 * a client from smuggling in a `senderId`, `createdAt` or `chatId`.
 */
export class SendMessageDto {
  @ApiProperty({
    example: 'Hello! How are you?',
    minLength: MESSAGE_MIN_LENGTH,
    maxLength: MESSAGE_MAX_LENGTH,
  })
  // Trimmed before validation so a body of only whitespace is rejected as
  // empty instead of being stored as a blank-looking message.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(MESSAGE_MIN_LENGTH, { message: 'content must not be empty' })
  @MaxLength(MESSAGE_MAX_LENGTH, {
    message: `content must be at most ${MESSAGE_MAX_LENGTH} characters`,
  })
  content: string;
}
