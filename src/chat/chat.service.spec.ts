import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ChatService', () => {
  let service: ChatService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    chat: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const otherParticipant = {
    id: 2,
    username: 'janedoe',
    displayName: 'Jane Doe',
    avatarUrl: null,
  };

  const currentParticipant = {
    id: 1,
    username: 'johndoe',
    displayName: 'John Doe',
    avatarUrl: null,
  };

  const message = {
    id: 100,
    chatId: 7,
    senderId: 1,
    content: 'Hello!',
    createdAt: new Date('2026-01-01T10:00:00Z'),
    updatedAt: new Date('2026-01-01T10:00:00Z'),
  };

  const buildChat = (
    userOneId: number,
    userTwoId: number,
    overrides: Record<string, unknown> = {},
  ) => ({
    id: 7,
    userOneId,
    userTwoId,
    lastMessageAt: new Date('2026-01-01T10:00:00Z'),
    createdAt: new Date('2026-01-01T09:00:00Z'),
    updatedAt: new Date('2026-01-01T10:00:00Z'),
    userOne: { ...currentParticipant, id: userOneId },
    userTwo: { ...otherParticipant, id: userTwoId },
    messages: [message],
    ...overrides,
  });

  /** A chat between the caller (1) and the other participant (2). */
  const callerChat = (overrides: Record<string, unknown> = {}) =>
    buildChat(1, 2, overrides);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a chat with the target user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 2 });
      mockPrismaService.chat.findUnique.mockResolvedValue(null);
      mockPrismaService.chat.create.mockResolvedValue(callerChat());

      const result = await service.create({ userId: 2 }, 1);

      expect(result).toEqual({
        id: 7,
        otherParticipantId: 2,
        otherParticipant,
        lastMessage: message,
        lastMessageAt: new Date('2026-01-01T10:00:00Z'),
        createdAt: new Date('2026-01-01T09:00:00Z'),
        updatedAt: new Date('2026-01-01T10:00:00Z'),
      });
      expect(mockPrismaService.chat.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userOneId: 1, userTwoId: 2 },
        }),
      );
    });

    it('should reject a chat with yourself', async () => {
      await expect(service.create({ userId: 1 }, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.chat.create).not.toHaveBeenCalled();
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the target user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.create({ userId: 99 }, 1)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.chat.create).not.toHaveBeenCalled();
    });

    it('should store the participants in canonical order when the caller has the higher id', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrismaService.chat.findUnique.mockResolvedValue(null);
      mockPrismaService.chat.create.mockResolvedValue(buildChat(1, 5));

      const result = await service.create({ userId: 1 }, 5);

      // 5 -> 1 must be stored as (1, 5), otherwise the same pair could be
      // inserted twice in two different orders.
      expect(mockPrismaService.chat.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userOneId: 1, userTwoId: 5 },
        }),
      );
      // The caller is userTwo here, so the *other* participant is userOne.
      expect(result.otherParticipantId).toBe(1);
    });

    it('should return the existing chat instead of creating a second one', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 2 });
      mockPrismaService.chat.findUnique.mockResolvedValue(callerChat());

      const result = await service.create({ userId: 2 }, 1);

      expect(result.id).toBe(7);
      expect(mockPrismaService.chat.create).not.toHaveBeenCalled();
    });

    it('should resolve a concurrent duplicate insert to the winning chat', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 2 });
      mockPrismaService.chat.findUnique
        // First lookup misses, then the winner's row is found after the
        // unique violation.
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(callerChat());
      mockPrismaService.chat.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.10.0',
        }),
      );

      const result = await service.create({ userId: 2 }, 1);

      expect(result.id).toBe(7);
    });

    it('should rethrow a unique violation when no chat can be read back', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 2 });
      mockPrismaService.chat.findUnique.mockResolvedValue(null);
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '7.10.0' },
      );
      mockPrismaService.chat.create.mockRejectedValue(error);

      await expect(service.create({ userId: 2 }, 1)).rejects.toThrow(error);
    });

    it('should not swallow an unrelated Prisma error', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 2 });
      mockPrismaService.chat.findUnique.mockResolvedValue(null);
      const error = new Prisma.PrismaClientKnownRequestError('Boom', {
        code: 'P1001',
        clientVersion: '7.10.0',
      });
      mockPrismaService.chat.create.mockRejectedValue(error);

      await expect(service.create({ userId: 2 }, 1)).rejects.toThrow(error);
    });

    it('should only ever select public user fields', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 2 });
      mockPrismaService.chat.findUnique.mockResolvedValue(null);
      mockPrismaService.chat.create.mockResolvedValue(callerChat());

      await service.create({ userId: 2 }, 1);

      const { include } = mockPrismaService.chat.create.mock.calls[0][0];

      expect(include.userOne.select).toEqual({
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      });
      expect(include.userTwo.select).toEqual({
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      });
    });
  });

  describe('findAllForUser', () => {
    it('should scope the query to the authenticated user only', async () => {
      mockPrismaService.chat.findMany.mockResolvedValue([callerChat()]);
      mockPrismaService.chat.count.mockResolvedValue(1);

      await service.findAllForUser(1, 1, 20);

      expect(mockPrismaService.chat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ userOneId: 1 }, { userTwoId: 1 }] },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should order by most recent activity, empty chats last', async () => {
      mockPrismaService.chat.findMany.mockResolvedValue([]);
      mockPrismaService.chat.count.mockResolvedValue(0);

      await service.findAllForUser(1);

      expect(mockPrismaService.chat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { lastMessageAt: { sort: 'desc', nulls: 'last' } },
            { id: 'desc' },
          ],
        }),
      );
    });

    it('should translate the other participant for each chat', async () => {
      mockPrismaService.chat.findMany.mockResolvedValue([
        callerChat(),
        buildChat(1, 9, { id: 8 }),
      ]);
      mockPrismaService.chat.count.mockResolvedValue(2);

      const result = await service.findAllForUser(1);

      // Chat 8 lists user 2 (who is the caller's side) as *other* only when
      // the caller is 9; for caller 1 the other participant is userOne.
      expect(result.data[0].otherParticipantId).toBe(2);
      expect(result.data[1].otherParticipantId).toBe(9);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);
    });

    it('should return null as the last message of an empty chat', async () => {
      mockPrismaService.chat.findMany.mockResolvedValue([
        callerChat({ messages: [], lastMessageAt: null }),
      ]);
      mockPrismaService.chat.count.mockResolvedValue(1);

      const result = await service.findAllForUser(1);

      expect(result.data[0].lastMessage).toBeNull();
      expect(result.data[0].lastMessageAt).toBeNull();
    });

    it('should never expose the internal participant columns', async () => {
      mockPrismaService.chat.findMany.mockResolvedValue([callerChat()]);
      mockPrismaService.chat.count.mockResolvedValue(1);

      const result = await service.findAllForUser(1);

      expect(result.data[0]).not.toHaveProperty('userOneId');
      expect(result.data[0]).not.toHaveProperty('userTwoId');
      expect(result.data[0]).not.toHaveProperty('userOne');
      expect(result.data[0]).not.toHaveProperty('userTwo');
    });

    it('should apply the pagination window', async () => {
      mockPrismaService.chat.findMany.mockResolvedValue([]);
      mockPrismaService.chat.count.mockResolvedValue(0);

      await service.findAllForUser(1, 3, 5);

      expect(mockPrismaService.chat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });
  });

  describe('findOne', () => {
    it('should return the chat for a participant', async () => {
      mockPrismaService.chat.findFirst.mockResolvedValue(callerChat());

      const result = await service.findOne(7, 2);

      expect(result.id).toBe(7);
      expect(result.otherParticipantId).toBe(1);
    });

    it('should scope the lookup to the participants', async () => {
      mockPrismaService.chat.findFirst.mockResolvedValue(callerChat());

      await service.findOne(7, 1);

      expect(mockPrismaService.chat.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 7,
            OR: [{ userOneId: 1 }, { userTwoId: 1 }],
          },
        }),
      );
    });

    it('should hide a chat the caller does not participate in behind a 404', async () => {
      mockPrismaService.chat.findFirst.mockResolvedValue(null);

      // Same exception as an unknown id: the response must not reveal
      // whether the chat exists.
      await expect(service.findOne(7, 3)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(7, 3)).rejects.toThrow('Chat not found');
    });
  });

  describe('sendMessage', () => {
    beforeEach(() => {
      mockPrismaService.chat.findFirst.mockResolvedValue(callerChat());
      mockPrismaService.message.create.mockResolvedValue(message);
      mockPrismaService.chat.update.mockResolvedValue(callerChat());
      // Interactive transaction: the service hands over a callback that runs
      // against the transaction client, and the fake just awaits it.
      mockPrismaService.$transaction.mockImplementation(
        (work: (tx: unknown) => Promise<unknown>) => work(mockPrismaService),
      );
    });

    it('should store the message with the authenticated user as sender', async () => {
      const result = await service.sendMessage(7, { content: 'Hello!' }, 2);

      expect(result).toEqual(message);
      expect(mockPrismaService.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          chatId: 7,
          senderId: 2,
          content: 'Hello!',
        }),
      });
    });

    it('should not accept a sender from the payload', async () => {
      await service.sendMessage(
        7,
        { content: 'Hello!', senderId: 99 } as never,
        2,
      );

      // senderId in the body is dropped: the write uses the JWT subject.
      expect(mockPrismaService.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ senderId: 2 }),
      });
    });

    it('should check participation and write inside one transaction', async () => {
      await service.sendMessage(7, { content: 'Hello!' }, 2);

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.chat.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: expect.objectContaining({ lastMessageAt: expect.any(Date) }),
      });
    });

    it('should run the participant check inside the transaction', async () => {
      const order: string[] = [];

      mockPrismaService.chat.findFirst.mockImplementation(() => {
        order.push('check');
        return Promise.resolve(callerChat());
      });
      mockPrismaService.message.create.mockImplementation(() => {
        order.push('insert');
        return Promise.resolve(message);
      });

      await service.sendMessage(7, { content: 'Hello!' }, 2);

      // Checking outside the transaction would leave a window where the chat
      // is deleted before the insert.
      expect(order).toEqual(['check', 'insert']);
      const [work] = mockPrismaService.$transaction.mock.calls[0];
      expect(typeof work).toBe('function');
    });

    it('should write the same timestamp on the message and the chat', async () => {
      await service.sendMessage(7, { content: 'Hello!' }, 2);

      const { data: chatData } = mockPrismaService.chat.update.mock.calls[0][0];
      const { data: messageData } =
        mockPrismaService.message.create.mock.calls[0][0];

      expect(chatData.lastMessageAt).toEqual(messageData.createdAt);
    });

    it('should reject a non participant', async () => {
      mockPrismaService.chat.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage(7, { content: 'Hello!' }, 3),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.message.create).not.toHaveBeenCalled();
    });

    it('should reject an invalid chat id', async () => {
      mockPrismaService.chat.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage(123456, { content: 'Hello!' }, 1),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.message.create).not.toHaveBeenCalled();
    });

    it('should propagate a failed transaction', async () => {
      mockPrismaService.$transaction.mockRejectedValue(new Error('db down'));

      await expect(
        service.sendMessage(7, { content: 'Hello!' }, 1),
      ).rejects.toThrow('db down');
    });
  });

  describe('findMessages', () => {
    beforeEach(() => {
      mockPrismaService.chat.findFirst.mockResolvedValue(callerChat());
      mockPrismaService.message.findMany.mockResolvedValue([message]);
      mockPrismaService.message.count.mockResolvedValue(1);
    });

    it('should check participation before listing', async () => {
      mockPrismaService.chat.findFirst.mockResolvedValue(null);

      await expect(service.findMessages(7, 3, 1, 20)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.message.findMany).not.toHaveBeenCalled();
    });

    it('should list only the messages of the requested chat, oldest first', async () => {
      await service.findMessages(7, 1);

      expect(mockPrismaService.message.findMany).toHaveBeenCalledWith({
        where: { chatId: 7 },
        skip: 0,
        take: 20,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      expect(mockPrismaService.message.count).toHaveBeenCalledWith({
        where: { chatId: 7 },
      });
    });

    it('should apply the pagination window', async () => {
      const result = await service.findMessages(7, 1, 2, 10);

      expect(mockPrismaService.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
      expect(result).toEqual({
        data: [message],
        total: 1,
        page: 2,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should not load the sender relation', async () => {
      await service.findMessages(7, 1);

      // Messages only carry the numeric sender id; the client resolves the
      // participant from the chat it already has.
      expect(mockPrismaService.message.findMany).toHaveBeenCalledWith(
        expect.not.objectContaining({ include: expect.anything() }),
      );
    });
  });
});
