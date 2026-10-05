import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  ChatListResponseDto,
  ChatResponseDto,
  MessageListResponseDto,
  MessageResponseDto,
} from './dto/chat-response.dto';

/**
 * Fields of a user that are safe to expose to another user. Selected
 * explicitly on every query so a new column on `users` can never leak by
 * accident through a `include` or a full row fetch.
 */
const participantSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

type ChatWithParticipantsAndLastMessage = Prisma.ChatGetPayload<{
  include: {
    userOne: { select: typeof participantSelect };
    userTwo: { select: typeof participantSelect };
    messages: { take: 1 };
  };
}>;

/** Prisma error code for a unique constraint violation (P2002). */
const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  /**
   * Opens a one-to-one chat with another user, or returns the existing one.
   *
   * Uniqueness is enforced by the database: participants are stored in a
   * canonical order (`lower id`, `higher id`) behind a unique constraint, so
   * `A -> B` and `B -> A` resolve to the same row. The application level
   * lookup below is only a fast path; it is not trusted, because two
   * concurrent requests can both miss it. If both reach the insert, one of
   * them gets a unique violation from Postgres and is served the row the
   * winner created.
   */
  async create(
    createChatDto: CreateChatDto,
    currentUserId: number,
  ): Promise<ChatResponseDto> {
    const { userId: targetUserId } = createChatDto;

    if (targetUserId === currentUserId) {
      throw new BadRequestException('You cannot start a chat with yourself');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException('User not found');
    }

    const [userOneId, userTwoId] = this.orderParticipants(
      currentUserId,
      targetUserId,
    );

    const existing = await this.prisma.chat.findUnique({
      where: { userOneId_userTwoId: { userOneId, userTwoId } },
      include: this.chatInclude,
    });

    if (existing) {
      return this.toChatResponse(existing, currentUserId);
    }

    try {
      const chat = await this.prisma.chat.create({
        data: { userOneId, userTwoId },
        include: this.chatInclude,
      });

      return this.toChatResponse(chat, currentUserId);
    } catch (error) {
      // Lost the race against a concurrent request for the same pair: the
      // other transaction committed first, so the conversation already
      // exists and is served to the caller instead of surfacing a 500.
      if (this.isUniqueViolation(error)) {
        const concurrent = await this.prisma.chat.findUnique({
          where: { userOneId_userTwoId: { userOneId, userTwoId } },
          include: this.chatInclude,
        });

        if (concurrent) {
          return this.toChatResponse(concurrent, currentUserId);
        }
      }

      throw error;
    }
  }

  /**
   * Lists the chats the caller participates in, most recently active first.
   *
   * Both participants and the last message are loaded in the same query, so
   * the cost does not grow with the page size.
   */
  async findAllForUser(
    currentUserId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<ChatListResponseDto> {
    const skip = (page - 1) * limit;
    const where: Prisma.ChatWhereInput = {
      OR: [{ userOneId: currentUserId }, { userTwoId: currentUserId }],
    };

    const [chats, total] = await Promise.all([
      this.prisma.chat.findMany({
        where,
        skip,
        take: limit,
        include: this.chatInclude,
        // Chats with no message yet sort last; `id` keeps the order stable
        // when two chats share a timestamp.
        orderBy: [
          { lastMessageAt: { sort: 'desc', nulls: 'last' } },
          { id: 'desc' },
        ],
      }),
      this.prisma.chat.count({ where }),
    ]);

    return {
      data: chats.map((chat) => this.toChatResponse(chat, currentUserId)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Returns a single chat. A chat the caller does not participate in is
   * reported as `404`, the same answer as an id that does not exist, so the
   * endpoint cannot be used to probe for valid chat ids (IDOR/BOLA).
   */
  async findOne(
    chatId: number,
    currentUserId: number,
  ): Promise<ChatResponseDto> {
    const chat = await this.prisma.chat.findFirst({
      where: {
        id: chatId,
        OR: [{ userOneId: currentUserId }, { userTwoId: currentUserId }],
      },
      include: this.chatInclude,
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    return this.toChatResponse(chat, currentUserId);
  }

  /**
   * Sends a message to a chat the caller participates in.
   *
   * The sender always comes from the authenticated context. The message insert
   * and the `lastMessageAt` bump happen in a single transaction, so the chat
   * list can never show a timestamp that no message backs.
   */
  async sendMessage(
    chatId: number,
    sendMessageDto: SendMessageDto,
    currentUserId: number,
  ): Promise<MessageResponseDto> {
    const { content } = sendMessageDto;
    const now = new Date();

    // The authorization check runs inside the transaction: checking it
    // outside would leave a window where the chat is deleted between the
    // check and the insert, and the insert would then fail with a raw
    // database error instead of a 404.
    return this.prisma.$transaction(async (tx) => {
      const chat = await this.findChatForParticipant(chatId, currentUserId, tx);

      if (!chat) {
        throw new NotFoundException('Chat not found');
      }

      const message = await tx.message.create({
        data: {
          chatId,
          senderId: currentUserId,
          content,
          createdAt: now,
          updatedAt: now,
        },
      });

      await tx.chat.update({
        where: { id: chatId },
        data: { lastMessageAt: now, updatedAt: now },
      });

      return message;
    });
  }

  /**
   * Lists the messages of a chat the caller participates in, oldest first.
   * Backs the `messages_chat_id_id_idx` index and is paginated.
   */
  async findMessages(
    chatId: number,
    currentUserId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<MessageListResponseDto> {
    await this.requireParticipant(chatId, currentUserId);

    const skip = (page - 1) * limit;
    const where: Prisma.MessageWhereInput = { chatId };

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        skip,
        take: limit,
        // `id` is monotonic, so it is a stable chronological tiebreaker when
        // several messages share a `createdAt` within the same millisecond.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.message.count({ where }),
    ]);

    return {
      data: messages,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Loads a chat only if the caller is one of its two participants, returning
   * `null` otherwise.
   *
   * The participant filter is part of the query itself rather than a check on
   * a previously loaded row: a chat the caller does not belong to is never
   * read, so there is no branch that could accidentally operate on it. Every
   * chat scoped operation funnels through this (or `requireParticipant`), so
   * the check cannot be forgotten on one of the routes.
   *
   * Accepts the transaction client so callers that need the check and the
   * write to be atomic can run both inside one transaction.
   */
  private findChatForParticipant(
    chatId: number,
    currentUserId: number,
    client: Pick<PrismaService, 'chat'> = this.prisma,
  ): Promise<ChatWithParticipantsAndLastMessage | null> {
    return client.chat.findFirst({
      where: {
        id: chatId,
        OR: [{ userOneId: currentUserId }, { userTwoId: currentUserId }],
      },
      include: this.chatInclude,
    });
  }

  /** `findChatForParticipant` for the read paths, as a hard requirement. */
  private async requireParticipant(
    chatId: number,
    currentUserId: number,
  ): Promise<void> {
    const exists = await this.prisma.chat.findFirst({
      where: {
        id: chatId,
        OR: [{ userOneId: currentUserId }, { userTwoId: currentUserId }],
      },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('Chat not found');
    }
  }

  /**
   * Relation selection shared by every chat read: both participants (public
   * fields only) plus the single most recent message. `take: 1` inside the
   * include makes Prisma fetch it with a single lateral join instead of one
   * query per chat.
   */
  private readonly chatInclude = {
    userOne: { select: participantSelect },
    userTwo: { select: participantSelect },
    messages: {
      orderBy: { id: 'desc' as const },
      take: 1,
      select: {
        id: true,
        chatId: true,
        senderId: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
    },
  } satisfies Prisma.ChatInclude;

  /**
   * Projects a stored chat into the API shape, exposing the *other*
   * participant rather than the internal `userOneId`/`userTwoId` pair.
   */
  private toChatResponse(
    chat: ChatWithParticipantsAndLastMessage,
    currentUserId: number,
  ): ChatResponseDto {
    const otherParticipant =
      chat.userOneId === currentUserId ? chat.userTwo : chat.userOne;

    return {
      id: chat.id,
      otherParticipantId: otherParticipant.id,
      otherParticipant,
      lastMessage: chat.messages[0] ?? null,
      lastMessageAt: chat.lastMessageAt,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }

  /** Canonical participant order: lower id first, as the DB constraint requires. */
  private orderParticipants(
    currentUserId: number,
    targetUserId: number,
  ): [number, number] {
    return currentUserId < targetUserId
      ? [currentUserId, targetUserId]
      : [targetUserId, currentUserId];
  }

  /**
   * Recognises a unique constraint violation. Prisma error internals are
   * never forwarded to the client; they are only used to pick the right
   * response here.
   */
  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_VIOLATION
    );
  }
}
