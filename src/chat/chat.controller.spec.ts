import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserThrottleGuard } from '../common/guards/user-throttle.guard';
import { collectRoutes, routeOf } from '../common/testing/route-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  CHAT_CREATE_IP_RATE_LIMIT,
  CHAT_CREATE_RATE_LIMIT,
  CHAT_MESSAGE_IP_RATE_LIMIT,
  CHAT_MESSAGE_RATE_LIMIT,
  USER_THROTTLER_NAME,
} from '../common/config/rate-limit.config';

describe('ChatController', () => {
  let controller: ChatController;

  const mockChatService = {
    create: jest.fn(),
    findAllForUser: jest.fn(),
    findOne: jest.fn(),
    sendMessage: jest.fn(),
    findMessages: jest.fn(),
  };

  const paginatedChats = {
    data: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      // `UserThrottleGuard` is attached to the routes, so the throttler
      // options/storage providers have to be resolvable for the controller to
      // be instantiated. In the application these come from the global
      // `ThrottlerModule.forRoot()` configured in `AppModule`.
      imports: [
        ThrottlerModule.forRoot({
          errorMessage: 'Too Many Requests',
          throttlers: [{ name: 'default', limit: 100, ttl: 60_000 }],
        }),
      ],
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: mockChatService,
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('routes', () => {
    it('should expose the chat endpoints', () => {
      expect(collectRoutes(ChatController)).toEqual(
        [
          'POST /chats',
          'GET /chats',
          'GET /chats/:chatId',
          'POST /chats/:chatId/messages',
          'GET /chats/:chatId/messages',
        ].sort(),
      );
    });

    it('should map each handler to its route', () => {
      expect(routeOf(ChatController, 'create')).toBe('POST /chats');
      expect(routeOf(ChatController, 'findAll')).toBe('GET /chats');
      expect(routeOf(ChatController, 'findOne')).toBe('GET /chats/:chatId');
      expect(routeOf(ChatController, 'sendMessage')).toBe(
        'POST /chats/:chatId/messages',
      );
      expect(routeOf(ChatController, 'findMessages')).toBe(
        'GET /chats/:chatId/messages',
      );
    });
  });

  describe('authentication', () => {
    type GuardClass = abstract new (...args: never[]) => object;

    const guardsOf = (handler: string): GuardClass[] => {
      const prototype = ChatController.prototype as unknown as Record<
        string,
        unknown
      >;

      return (Reflect.getMetadata(
        GUARDS_METADATA,
        prototype[handler] as object,
      ) ?? []) as GuardClass[];
    };

    it.each(['create', 'findAll', 'findOne', 'sendMessage', 'findMessages'])(
      'should require a valid token on %s',
      (handler) => {
        const guards = guardsOf(handler);

        expect(guards).toContain(JwtAuthGuard);
      },
    );

    it.each(['create', 'findAll', 'findOne', 'sendMessage', 'findMessages'])(
      'should rate limit %s per authenticated user',
      (handler) => {
        const guards = guardsOf(handler);

        expect(guards).toContain(UserThrottleGuard);
        // The user keyed guard must run after authentication, otherwise there
        // is no user on the request to key the budget on.
        expect(guards.indexOf(JwtAuthGuard)).toBeLessThan(
          guards.indexOf(UserThrottleGuard),
        );
      },
    );

    it.each([
      ['create', CHAT_CREATE_IP_RATE_LIMIT, CHAT_CREATE_RATE_LIMIT],
      ['sendMessage', CHAT_MESSAGE_IP_RATE_LIMIT, CHAT_MESSAGE_RATE_LIMIT],
    ])(
      'should allow a looser per-IP budget than the per-user one on %s',
      (handler, ipLimit, userLimit) => {
        const handlerFn = (
          ChatController.prototype as unknown as Record<string, object>
        )[handler];

        const limitOf = (name: string) =>
          Reflect.getMetadata(`THROTTLER:LIMIT${name}`, handlerFn) as number;

        expect(limitOf('default')).toBe(ipLimit.limit);
        expect(limitOf(USER_THROTTLER_NAME)).toBe(userLimit.limit);

        // If the two budgets were equal, every user behind a shared IP would
        // exhaust the per-IP one first and the per-user budget would never be
        // the binding constraint.
        expect(limitOf(USER_THROTTLER_NAME)).toBeLessThan(limitOf('default'));
      },
    );
  });

  describe('create', () => {
    it('should forward the payload and the authenticated user id', async () => {
      const createChatDto = { userId: 2 };
      const chat = { id: 7 };

      mockChatService.create.mockResolvedValue(chat);

      const result = await controller.create(createChatDto, 1);

      expect(mockChatService.create).toHaveBeenCalledWith(createChatDto, 1);
      expect(result).toBe(chat);
    });

    it('should take the current user from the authentication context only', () => {
      // The handler's parameters are the DTO and the id resolved from the
      // JWT: there is no body field a client could use to act as someone else.
      expect(ChatController.prototype.create.length).toBe(2);
    });

    it('should expose no route parameter on create, so no id can be smuggled', () => {
      expect(routeOf(ChatController, 'create')).toBe('POST /chats');
    });
  });

  describe('findAll', () => {
    it('should forward the pagination and the authenticated user id', async () => {
      mockChatService.findAllForUser.mockResolvedValue(paginatedChats);

      await controller.findAll({ page: 2, limit: 10 }, 1);

      expect(mockChatService.findAllForUser).toHaveBeenCalledWith(1, 2, 10);
    });
  });

  describe('findOne', () => {
    it('should forward the chat id and the authenticated user id', async () => {
      const chat = { id: 7 };

      mockChatService.findOne.mockResolvedValue(chat);

      const result = await controller.findOne(7, 1);

      expect(mockChatService.findOne).toHaveBeenCalledWith(7, 1);
      expect(result).toBe(chat);
    });
  });

  describe('sendMessage', () => {
    it('should forward the chat id, the payload and the authenticated user id', async () => {
      const sendMessageDto = { content: 'Hello!' };

      mockChatService.sendMessage.mockResolvedValue({ id: 42 });

      const result = await controller.sendMessage(7, sendMessageDto, 1);

      expect(mockChatService.sendMessage).toHaveBeenCalledWith(
        7,
        sendMessageDto,
        1,
      );
      expect(result).toEqual({ id: 42 });
    });
  });

  describe('findMessages', () => {
    it('should forward the chat id, the pagination and the authenticated user id', async () => {
      mockChatService.findMessages.mockResolvedValue({
        ...paginatedChats,
      });

      await controller.findMessages(7, { page: 1, limit: 20 }, 1);

      expect(mockChatService.findMessages).toHaveBeenCalledWith(7, 1, 1, 20);
    });
  });
});
