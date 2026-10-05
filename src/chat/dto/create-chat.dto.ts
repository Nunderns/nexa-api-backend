import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body of `POST /chats`.
 *
 * Only the *target* user id is accepted. The current user is taken from the
 * JWT by the controller, never from the body, so a client cannot open a chat
 * on someone else's behalf. The global validation pipe runs with
 * `forbidNonWhitelisted`, so any extra field (including `senderId`) is
 * rejected with a 400 instead of being silently ignored.
 */
export class CreateChatDto {
  @ApiProperty({ example: 2, description: 'Id of the user to chat with' })
  @IsInt({ message: 'userId must be an integer' })
  @Min(1, { message: 'userId must be a positive integer' })
  userId: number;
}
