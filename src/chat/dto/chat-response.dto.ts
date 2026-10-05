import { ApiProperty } from '@nestjs/swagger';

/**
 * A chat participant as seen by the other side of the conversation.
 *
 * Deliberately limited to public profile fields: no email, no password hash,
 * no email verification or reset tokens, no activity flags.
 */
export class ChatParticipantResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'johndoe' })
  username: string;

  @ApiProperty({ example: 'John Doe' })
  displayName: string;

  @ApiProperty({
    example: 'https://example.com/avatar.jpg',
    required: false,
    nullable: true,
  })
  avatarUrl?: string | null;
}

export class MessageResponseDto {
  @ApiProperty({ example: 42 })
  id: number;

  @ApiProperty({ example: 7 })
  chatId: number;

  @ApiProperty({ example: 1 })
  senderId: number;

  @ApiProperty({ example: 'Hello! How are you?' })
  content: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  updatedAt: Date;
}

export class ChatResponseDto {
  @ApiProperty({ example: 7 })
  id: number;

  @ApiProperty({
    example: 2,
    description: 'Id of the other participant (never the requester)',
  })
  otherParticipantId: number;

  @ApiProperty({ type: ChatParticipantResponseDto })
  otherParticipant: ChatParticipantResponseDto;

  @ApiProperty({
    type: MessageResponseDto,
    nullable: true,
    description: 'Most recent message of the chat, null when still empty',
  })
  lastMessage: MessageResponseDto | null;

  @ApiProperty({
    example: '2024-01-01T00:00:00Z',
    nullable: true,
    description:
      'Timestamp of the most recent message, used to sort the chat list',
  })
  lastMessageAt: Date | null;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  updatedAt: Date;
}

export class ChatListResponseDto {
  @ApiProperty({ type: [ChatResponseDto] })
  data: ChatResponseDto[];

  @ApiProperty({ example: 3 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}

export class MessageListResponseDto {
  @ApiProperty({ type: [MessageResponseDto] })
  data: MessageResponseDto[];

  @ApiProperty({ example: 3 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}
