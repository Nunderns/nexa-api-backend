import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CHAT_CREATE_IP_RATE_LIMIT,
  CHAT_CREATE_RATE_LIMIT,
  CHAT_MESSAGE_IP_RATE_LIMIT,
  CHAT_MESSAGE_RATE_LIMIT,
  GLOBAL_RATE_LIMIT,
  USER_THROTTLER_NAME,
} from '../common/config/rate-limit.config';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UserThrottleGuard } from '../common/guards/user-throttle.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  ChatListResponseDto,
  ChatResponseDto,
  MessageListResponseDto,
  MessageResponseDto,
} from './dto/chat-response.dto';

@ApiTags('chats')
@Controller('chats')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Returns the existing conversation when one is already open, so
   * `200` rather than `201`: the client gets an idempotent "ensure a chat
   * exists" behaviour instead of having to handle a conflict itself.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, UserThrottleGuard)
  @Throttle({
    default: CHAT_CREATE_IP_RATE_LIMIT,
    [USER_THROTTLER_NAME]: CHAT_CREATE_RATE_LIMIT,
  })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Open a one-to-one chat with another user',
    description:
      'Idempotent: returns the existing chat when the pair already has one. ' +
      'The current user is taken from the access token, never from the body.',
  })
  @ApiOkResponse({
    description: 'Chat created or already existing',
    type: ChatResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Cannot chat with yourself' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 404, description: 'Target user not found' })
  @ApiResponse({ status: 429, description: 'Too many chat creation attempts' })
  async create(
    @Body() createChatDto: CreateChatDto,
    @CurrentUser('id') currentUserId: number,
  ): Promise<ChatResponseDto> {
    return this.chatService.create(createChatDto, currentUserId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, UserThrottleGuard)
  @Throttle({
    default: GLOBAL_RATE_LIMIT,
    [USER_THROTTLER_NAME]: GLOBAL_RATE_LIMIT,
  })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List the authenticated user chats, most recent first',
  })
  @ApiOkResponse({
    description: 'Chats retrieved successfully',
    type: ChatListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async findAll(
    @Query() pagination: PaginationDto,
    @CurrentUser('id') currentUserId: number,
  ): Promise<ChatListResponseDto> {
    return this.chatService.findAllForUser(
      currentUserId,
      pagination.page,
      pagination.limit,
    );
  }

  @Get(':chatId')
  @UseGuards(JwtAuthGuard, UserThrottleGuard)
  @Throttle({
    default: GLOBAL_RATE_LIMIT,
    [USER_THROTTLER_NAME]: GLOBAL_RATE_LIMIT,
  })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get a chat by id',
    description:
      'Returns 404 for a chat the caller does not participate in, the same ' +
      'answer as an unknown id.',
  })
  @ApiOkResponse({
    description: 'Chat retrieved successfully',
    type: ChatResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'chatId is not a valid integer',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async findOne(
    @Param('chatId', ParseIntPipe) chatId: number,
    @CurrentUser('id') currentUserId: number,
  ): Promise<ChatResponseDto> {
    return this.chatService.findOne(chatId, currentUserId);
  }

  @Post(':chatId/messages')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, UserThrottleGuard)
  @Throttle({
    default: CHAT_MESSAGE_IP_RATE_LIMIT,
    [USER_THROTTLER_NAME]: CHAT_MESSAGE_RATE_LIMIT,
  })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Send a message to a chat',
    description:
      'The sender is always the authenticated user; the body carries the ' +
      'content only.',
  })
  @ApiResponse({
    status: 201,
    description: 'Message sent successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid message content' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  @ApiResponse({ status: 429, description: 'Too many messages sent' })
  async sendMessage(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Body() sendMessageDto: SendMessageDto,
    @CurrentUser('id') currentUserId: number,
  ): Promise<MessageResponseDto> {
    return this.chatService.sendMessage(chatId, sendMessageDto, currentUserId);
  }

  @Get(':chatId/messages')
  @UseGuards(JwtAuthGuard, UserThrottleGuard)
  @Throttle({
    default: GLOBAL_RATE_LIMIT,
    [USER_THROTTLER_NAME]: GLOBAL_RATE_LIMIT,
  })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List the messages of a chat, oldest first',
  })
  @ApiOkResponse({
    description: 'Messages retrieved successfully',
    type: MessageListResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'chatId is not a valid integer',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async findMessages(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Query() pagination: PaginationDto,
    @CurrentUser('id') currentUserId: number,
  ): Promise<MessageListResponseDto> {
    return this.chatService.findMessages(
      chatId,
      currentUserId,
      pagination.page,
      pagination.limit,
    );
  }
}
