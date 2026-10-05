import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { Prisma } from '@prisma/client';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { configureApp } from './../src/common/config/configure-app';
import { CHAT_MESSAGE_RATE_LIMIT } from './../src/common/config/rate-limit.config';

/**
 * End to end coverage of the chat flow over real HTTP, with the real JWT
 * strategy, guards, validation pipe and response envelope.
 *
 * Prisma is replaced by an in-memory fake that mimics the parts of the client
 * the chat service uses, including the unique constraint on the participant
 * pair. The suite therefore never touches a real database, so no development
 * or production data can be modified, while still exercising the whole
 * request path.
 *
 * The app is rebuilt for every test because the throttler keeps its counters
 * in memory per app instance; a shared instance would make the rate limits
 * leak between tests.
 */

interface FakeUser {
  id: number;
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
}

interface FakeChat {
  id: number;
  userOneId: number;
  userTwoId: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeMessage {
  id: number;
  chatId: number;
  senderId: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const USER_A = 1;
const USER_B = 2;
const USER_C = 3;

const jwtService = new JwtService({
  secret: process.env.JWT_SECRET || 'access-secret',
});

const tokenFor = (userId: number): string =>
  jwtService.sign({ sub: userId, email: `user${userId}@example.com` });

/** Relation projection accepted by the fake chat delegate. */
interface RelationInclude {
  userOne?: { select: Record<string, boolean> };
  userTwo?: { select: Record<string, boolean> };
}

/** In-memory stand-in for the Prisma delegates used by the chat feature. */
class FakePrismaService {
  readonly users: FakeUser[] = [
    {
      id: USER_A,
      username: 'alice',
      email: 'alice@example.com',
      displayName: 'Alice',
      avatarUrl: null,
      isActive: true,
      isEmailVerified: true,
    },
    {
      id: USER_B,
      username: 'bob',
      email: 'bob@example.com',
      displayName: 'Bob',
      avatarUrl: 'https://example.com/bob.png',
      isActive: true,
      isEmailVerified: true,
    },
    {
      id: USER_C,
      username: 'carol',
      email: 'carol@example.com',
      displayName: 'Carol',
      avatarUrl: null,
      isActive: true,
      isEmailVerified: true,
    },
  ];

  chats: FakeChat[] = [];
  messages: FakeMessage[] = [];

  private nextChatId = 1;
  private nextMessageId = 1;

  user = {
    findUnique: ({ where }: { where: { id: number } }) =>
      Promise.resolve(this.users.find((user) => user.id === where.id) ?? null),
  };

  chat = {
    findUnique: ({
      where,
      include,
    }: {
      where: Record<string, unknown>;
      include?: RelationInclude;
    }) => {
      const pair = where.userOneId_userTwoId as
        { userOneId: number; userTwoId: number } | undefined;

      if (!pair) {
        return Promise.resolve(null);
      }

      const chat = this.chats.find(
        (candidate) =>
          candidate.userOneId === pair.userOneId &&
          candidate.userTwoId === pair.userTwoId,
      );

      return Promise.resolve(chat ? this.withRelations(chat, include) : null);
    },

    findFirst: ({
      where,
      include,
    }: {
      where: Record<string, unknown>;
      include?: RelationInclude;
    }) => {
      const callerIds = callerIdsOf(where);
      const chat = this.chats.find(
        (candidate) =>
          candidate.id === where.id &&
          callerIds.some(
            (id) => id === candidate.userOneId || id === candidate.userTwoId,
          ),
      );

      return Promise.resolve(chat ? this.withRelations(chat, include) : null);
    },

    findMany: ({
      where,
      include,
      skip = 0,
      take,
    }: {
      where: Record<string, unknown>;
      include?: RelationInclude;
      skip?: number;
      take?: number;
    }) => {
      const callerIds = callerIdsOf(where);
      const matching = this.chats.filter((chat) =>
        callerIds.some((id) => chat.userOneId === id || chat.userTwoId === id),
      );

      // Most recently active first, empty chats last.
      matching.sort(
        (first, second) =>
          (second.lastMessageAt?.getTime() ?? 0) -
            (first.lastMessageAt?.getTime() ?? 0) || second.id - first.id,
      );

      return Promise.resolve(
        matching
          .slice(skip, take === undefined ? undefined : skip + take)
          .map((chat) => this.withRelations(chat, include)),
      );
    },

    count: ({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        this.chats.filter((chat) =>
          callerIdsOf(where).some(
            (id) => chat.userOneId === id || chat.userTwoId === id,
          ),
        ).length,
      ),

    create: ({
      data,
      include,
    }: {
      data: { userOneId: number; userTwoId: number };
      include?: RelationInclude;
    }) => {
      // Mirrors the database: the pair is unique, so a second insert fails
      // instead of silently duplicating the conversation.
      const duplicate = this.chats.some(
        (chat) =>
          chat.userOneId === data.userOneId &&
          chat.userTwoId === data.userTwoId,
      );

      if (duplicate) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed on the fields: (`user_one_id`,`user_two_id`)',
            { code: 'P2002', clientVersion: '7.10.0' },
          ),
        );
      }

      const now = new Date();
      const chat: FakeChat = {
        id: this.nextChatId++,
        userOneId: data.userOneId,
        userTwoId: data.userTwoId,
        lastMessageAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.chats.push(chat);

      return Promise.resolve(this.withRelations(chat, include));
    },

    update: ({
      where,
      data,
    }: {
      where: { id: number };
      data: { lastMessageAt: Date; updatedAt: Date };
    }) => {
      const chat = this.chats.find((candidate) => candidate.id === where.id);

      if (!chat) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('Record not found', {
            code: 'P2025',
            clientVersion: '7.10.0',
          }),
        );
      }

      chat.lastMessageAt = data.lastMessageAt;
      chat.updatedAt = data.updatedAt;

      return Promise.resolve(chat);
    },
  };

  message = {
    create: ({
      data,
    }: {
      data: {
        chatId: number;
        senderId: number;
        content: string;
        createdAt: Date;
        updatedAt: Date;
      };
    }) => {
      const message: FakeMessage = { id: this.nextMessageId++, ...data };
      this.messages.push(message);

      return Promise.resolve(message);
    },

    findMany: ({
      where,
      skip = 0,
      take,
    }: {
      where: { chatId: number };
      skip?: number;
      take?: number;
    }) => {
      const matching = this.messages
        .filter((message) => message.chatId === where.chatId)
        .sort(
          (first, second) =>
            first.createdAt.getTime() - second.createdAt.getTime() ||
            first.id - second.id,
        );

      return Promise.resolve(
        matching.slice(skip, take === undefined ? undefined : skip + take),
      );
    },

    count: ({ where }: { where: { chatId: number } }) =>
      Promise.resolve(
        this.messages.filter((message) => message.chatId === where.chatId)
          .length,
      ),
  };

  /** Interactive transaction, matching the shape the chat service uses. */
  $transaction = (work: (tx: unknown) => Promise<unknown>) => work(this);

  /**
   * Builds the shape Prisma would return for a chat with its relations,
   * honouring the `select` projection the service passes. Without this the
   * fake would hand back whole user rows and the assertions about data
   * exposure would pass for the wrong reason.
   */
  private withRelations(chat: FakeChat, include?: RelationInclude) {
    const project = (
      user: FakeUser | undefined,
      select?: Record<string, boolean>,
    ) => {
      if (!user) return undefined;
      if (!select) return user;

      return Object.fromEntries(
        Object.entries(user).filter(([field]) => select[field] === true),
      );
    };

    return {
      ...chat,
      userOne: project(
        this.users.find((user) => user.id === chat.userOneId),
        include?.userOne?.select,
      ),
      userTwo: project(
        this.users.find((user) => user.id === chat.userTwoId),
        include?.userTwo?.select,
      ),
      messages: this.messages
        .filter((message) => message.chatId === chat.id)
        .sort((first, second) => second.id - first.id)
        .slice(0, 1),
    };
  }
}

function callerIdsOf(where: Record<string, unknown>): number[] {
  const clauses = (where.OR ?? []) as {
    userOneId?: number;
    userTwoId?: number;
  }[];

  return clauses.flatMap((clause) =>
    [clause.userOneId, clause.userTwoId].filter(
      (id): id is number => typeof id === 'number',
    ),
  );
}

describe('Chat (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: FakePrismaService;

  const asUser = (userId: number) => ({
    Authorization: `Bearer ${tokenFor(userId)}`,
  });

  /** Opens a chat between the two main users and returns its id. */
  const openChat = async (): Promise<number> => {
    const response = await request(app.getHttpServer())
      .post('/chats')
      .set(asUser(USER_A))
      .send({ userId: USER_B })
      .expect(200);

    return response.body.data.id as number;
  };

  beforeEach(async () => {
    prisma = new FakePrismaService();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = configureApp(moduleFixture.createNestApplication());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('authentication', () => {
    it.each([
      ['get', '/chats'],
      ['get', '/chats/1'],
      ['get', '/chats/1/messages'],
    ] as const)('should reject %s %s without a token', (method, path) => {
      return request(app.getHttpServer())[method](path).expect(401);
    });

    it('should reject opening a chat without a token', () => {
      return request(app.getHttpServer())
        .post('/chats')
        .send({ userId: USER_B })
        .expect(401);
    });

    it('should reject sending a message without a token', () => {
      return request(app.getHttpServer())
        .post('/chats/1/messages')
        .send({ content: 'Hello!' })
        .expect(401);
    });

    it('should reject an invalid token', () => {
      return request(app.getHttpServer())
        .get('/chats')
        .set({ Authorization: 'Bearer not-a-jwt' })
        .expect(401);
    });

    it('should reject a token whose user does not exist', () => {
      return request(app.getHttpServer())
        .get('/chats')
        .set(asUser(999))
        .expect(401);
    });
  });

  describe('conversation flow', () => {
    it('should walk two users through a full exchange', async () => {
      const created = await request(app.getHttpServer())
        .post('/chats')
        .set(asUser(USER_A))
        .send({ userId: USER_B })
        .expect(200);

      expect(created.body).toEqual(
        expect.objectContaining({
          success: true,
          data: {
            id: expect.any(Number),
            otherParticipantId: USER_B,
            otherParticipant: {
              id: USER_B,
              username: 'bob',
              displayName: 'Bob',
              avatarUrl: 'https://example.com/bob.png',
            },
            lastMessage: null,
            lastMessageAt: null,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          },
        }),
      );

      const chatId = created.body.data.id;

      const sent = await request(app.getHttpServer())
        .post(`/chats/${chatId}/messages`)
        .set(asUser(USER_A))
        .send({ content: 'Hello!' })
        .expect(201);

      // The sender comes from the token, never from the payload.
      expect(sent.body.data).toEqual({
        id: expect.any(Number),
        chatId,
        senderId: USER_A,
        content: 'Hello!',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      const bobChat = await request(app.getHttpServer())
        .get(`/chats/${chatId}`)
        .set(asUser(USER_B))
        .expect(200);

      expect(bobChat.body.data.lastMessage).toEqual(
        expect.objectContaining({ content: 'Hello!', senderId: USER_A }),
      );

      const bobMessages = await request(app.getHttpServer())
        .get(`/chats/${chatId}/messages`)
        .set(asUser(USER_B))
        .expect(200);

      expect(bobMessages.body.data.data).toEqual([
        expect.objectContaining({ content: 'Hello!' }),
      ]);

      await request(app.getHttpServer())
        .post(`/chats/${chatId}/messages`)
        .set(asUser(USER_B))
        .send({ content: 'Hi, all good!' })
        .expect(201);

      const aliceMessages = await request(app.getHttpServer())
        .get(`/chats/${chatId}/messages`)
        .set(asUser(USER_A))
        .expect(200);

      expect(aliceMessages.body.data.data).toEqual([
        expect.objectContaining({ content: 'Hello!', senderId: USER_A }),
        expect.objectContaining({ content: 'Hi, all good!', senderId: USER_B }),
      ]);
    });

    it('should show the latest message on the chat list', async () => {
      const chatId = await openChat();

      await request(app.getHttpServer())
        .post(`/chats/${chatId}/messages`)
        .set(asUser(USER_A))
        .send({ content: 'First' })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get('/chats')
        .set(asUser(USER_B))
        .expect(200);

      expect(list.body.data.data).toEqual([
        expect.objectContaining({
          id: chatId,
          otherParticipantId: USER_A,
          lastMessage: expect.objectContaining({ content: 'First' }),
          lastMessageAt: expect.any(String),
        }),
      ]);
    });

    it('should return only the caller chats', async () => {
      await request(app.getHttpServer())
        .post('/chats')
        .set(asUser(USER_A))
        .send({ userId: USER_B })
        .expect(200);

      await request(app.getHttpServer())
        .post('/chats')
        .set(asUser(USER_B))
        .send({ userId: USER_C })
        .expect(200);

      const aliceChats = await request(app.getHttpServer())
        .get('/chats')
        .set(asUser(USER_A))
        .expect(200);

      expect(aliceChats.body.data.total).toBe(1);
      expect(aliceChats.body.data.data[0].otherParticipantId).toBe(USER_B);

      const bobChats = await request(app.getHttpServer())
        .get('/chats')
        .set(asUser(USER_B))
        .expect(200);

      expect(bobChats.body.data.total).toBe(2);
    });
  });

  describe('duplicate chats', () => {
    it('should return the same chat instead of creating a second one', async () => {
      const first = await request(app.getHttpServer())
        .post('/chats')
        .set(asUser(USER_A))
        .send({ userId: USER_B })
        .expect(200);

      const second = await request(app.getHttpServer())
        .post('/chats')
        .set(asUser(USER_A))
        .send({ userId: USER_B })
        .expect(200);

      expect(second.body.data.id).toBe(first.body.data.id);
      expect(prisma.chats).toHaveLength(1);
    });

    it('should resolve A -> B and B -> A to the same chat', async () => {
      const fromA = await request(app.getHttpServer())
        .post('/chats')
        .set(asUser(USER_A))
        .send({ userId: USER_B })
        .expect(200);

      const fromB = await request(app.getHttpServer())
        .post('/chats')
        .set(asUser(USER_B))
        .send({ userId: USER_A })
        .expect(200);

      expect(fromB.body.data.id).toBe(fromA.body.data.id);
      expect(prisma.chats).toHaveLength(1);
      expect(prisma.chats[0]).toEqual(
        expect.objectContaining({ userOneId: USER_A, userTwoId: USER_B }),
      );
    });

    it('should create a single chat under simultaneous requests', async () => {
      const responses = await Promise.all([
        request(app.getHttpServer())
          .post('/chats')
          .set(asUser(USER_A))
          .send({ userId: USER_B }),
        request(app.getHttpServer())
          .post('/chats')
          .set(asUser(USER_B))
          .send({ userId: USER_A }),
      ]);

      // Both requests race past the pre-check; only the unique constraint
      // keeps a single row, and the loser is served the winner's chat.
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(prisma.chats).toHaveLength(1);
      expect(
        new Set(responses.map((response) => response.body.data.id)).size,
      ).toBe(1);
    });
  });

  describe('authorization', () => {
    it('should hide another conversation behind a 404', async () => {
      const chatId = await openChat();

      const response = await request(app.getHttpServer())
        .get(`/chats/${chatId}`)
        .set(asUser(USER_C))
        .expect(404);

      expect(response.body).toEqual(
        expect.objectContaining({
          success: false,
          statusCode: 404,
          message: 'Chat not found',
        }),
      );
    });

    it('should answer an unknown chat id exactly like a forbidden one', async () => {
      const chatId = await openChat();

      const forbidden = await request(app.getHttpServer())
        .get(`/chats/${chatId}`)
        .set(asUser(USER_C))
        .expect(404);
      const unknown = await request(app.getHttpServer())
        .get('/chats/999999')
        .set(asUser(USER_C))
        .expect(404);

      // Identical apart from the request path and the response timestamp: the
      // endpoint must not confirm that an id exists.
      const strip = (body: Record<string, unknown>) => ({
        success: body.success,
        statusCode: body.statusCode,
        message: body.message,
      });

      expect(strip(forbidden.body)).toEqual(strip(unknown.body));
    });

    it('should refuse to send a message into a conversation the caller is not part of', async () => {
      const chatId = await openChat();

      await request(app.getHttpServer())
        .post(`/chats/${chatId}/messages`)
        .set(asUser(USER_C))
        .send({ content: 'Sneaking in' })
        .expect(404);

      expect(prisma.messages).toHaveLength(0);
    });

    it('should refuse to read the messages of a conversation the caller is not part of', async () => {
      const chatId = await openChat();

      await request(app.getHttpServer())
        .post(`/chats/${chatId}/messages`)
        .set(asUser(USER_A))
        .send({ content: 'Private' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/chats/${chatId}/messages`)
        .set(asUser(USER_C))
        .expect(404);

      expect(response.body.message).toBe('Chat not found');
      expect(JSON.stringify(response.body)).not.toContain('Private');
    });
  });

  describe('validation', () => {
    it('should refuse to chat with yourself', async () => {
      const response = await request(app.getHttpServer())
        .post('/chats')
        .set(asUser(USER_A))
        .send({ userId: USER_A })
        .expect(400);

      expect(response.body.message).toBe(
        'You cannot start a chat with yourself',
      );
      expect(prisma.chats).toHaveLength(0);
    });

    it('should return 404 for a user that does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/chats')
        .set(asUser(USER_A))
        .send({ userId: 9999 })
        .expect(404);

      expect(response.body.message).toBe('User not found');
    });

    it('should reject a non numeric userId', async () => {
      const response = await request(app.getHttpServer())
        .post('/chats')
        .set(asUser(USER_A))
        .send({ userId: 'abc' })
        .expect(400);

      expect(response.body.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('userId')]),
      );
    });

    it('should reject an unknown property instead of ignoring it', async () => {
      await request(app.getHttpServer())
        .post('/chats')
        .set(asUser(USER_A))
        .send({ userId: USER_B, isAdmin: true })
        .expect(400);
    });

    it('should reject an empty message', async () => {
      const chatId = await openChat();

      const response = await request(app.getHttpServer())
        .post(`/chats/${chatId}/messages`)
        .set(asUser(USER_A))
        .send({ content: '   ' })
        .expect(400);

      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('content must not be empty'),
        ]),
      );
      expect(prisma.messages).toHaveLength(0);
    });

    it('should reject a missing message content', async () => {
      const chatId = await openChat();

      await request(app.getHttpServer())
        .post(`/chats/${chatId}/messages`)
        .set(asUser(USER_A))
        .send({})
        .expect(400);
    });

    it('should reject an oversized message', async () => {
      const chatId = await openChat();

      const response = await request(app.getHttpServer())
        .post(`/chats/${chatId}/messages`)
        .set(asUser(USER_A))
        .send({ content: 'a'.repeat(2001) })
        .expect(400);

      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('content must be at most 2000 characters'),
        ]),
      );
      expect(prisma.messages).toHaveLength(0);
    });

    it('should accept a message of exactly the maximum length', async () => {
      const chatId = await openChat();

      const response = await request(app.getHttpServer())
        .post(`/chats/${chatId}/messages`)
        .set(asUser(USER_A))
        .send({ content: 'a'.repeat(2000) })
        .expect(201);

      expect(response.body.data.content).toHaveLength(2000);
    });

    it('should never let the client choose the sender', async () => {
      const chatId = await openChat();

      const response = await request(app.getHttpServer())
        .post(`/chats/${chatId}/messages`)
        .set(asUser(USER_A))
        .send({ content: 'Hello!', senderId: USER_C })
        .expect(400);

      // Rejected outright rather than silently dropping the field.
      expect(response.body.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('senderId')]),
      );
      expect(prisma.messages).toHaveLength(0);
    });

    it('should never let the client choose the chat or the timestamps', async () => {
      const chatId = await openChat();

      const response = await request(app.getHttpServer())
        .post(`/chats/${chatId}/messages`)
        .set(asUser(USER_A))
        .send({ content: 'Hello!', createdAt: '2020-01-01T00:00:00Z' })
        .expect(400);

      expect(response.body.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('createdAt')]),
      );
    });

    it('should reject a non numeric chat id', async () => {
      const response = await request(app.getHttpServer())
        .get('/chats/not-a-number')
        .set(asUser(USER_A))
        .expect(400);

      // Rejected by the route parameter pipe before any query runs.
      expect(response.body.statusCode).toBe(400);
      expect(JSON.stringify(response.body)).not.toContain('prisma');
    });

    it('should cap the page size on both collections', async () => {
      await request(app.getHttpServer())
        .get('/chats?limit=500')
        .set(asUser(USER_A))
        .expect(400);

      const chatId = await openChat();

      await request(app.getHttpServer())
        .get(`/chats/${chatId}/messages?limit=0`)
        .set(asUser(USER_A))
        .expect(400);
    });
  });

  describe('pagination', () => {
    it('should paginate the messages of a chat, oldest first', async () => {
      const chatId = await openChat();

      for (const content of ['one', 'two', 'three']) {
        await request(app.getHttpServer())
          .post(`/chats/${chatId}/messages`)
          .set(asUser(USER_A))
          .send({ content })
          .expect(201);
      }

      const firstPage = await request(app.getHttpServer())
        .get(`/chats/${chatId}/messages?page=1&limit=2`)
        .set(asUser(USER_A))
        .expect(200);

      expect(
        firstPage.body.data.data.map(
          (message: { content: string }) => message.content,
        ),
      ).toEqual(['one', 'two']);
      expect(firstPage.body.data.total).toBe(3);
      expect(firstPage.body.data.totalPages).toBe(2);

      const secondPage = await request(app.getHttpServer())
        .get(`/chats/${chatId}/messages?page=2&limit=2`)
        .set(asUser(USER_A))
        .expect(200);

      expect(
        secondPage.body.data.data.map(
          (message: { content: string }) => message.content,
        ),
      ).toEqual(['three']);
    });

    it('should paginate the chat list', async () => {
      for (const target of [USER_B, USER_C]) {
        await request(app.getHttpServer())
          .post('/chats')
          .set(asUser(USER_A))
          .send({ userId: target })
          .expect(200);
      }

      const response = await request(app.getHttpServer())
        .get('/chats?page=1&limit=1')
        .set(asUser(USER_A))
        .expect(200);

      expect(response.body.data.data).toHaveLength(1);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.totalPages).toBe(2);
    });
  });

  describe('data exposure', () => {
    it('should never return sensitive user fields', async () => {
      const chatId = await openChat();

      const chat = await request(app.getHttpServer())
        .get(`/chats/${chatId}`)
        .set(asUser(USER_B))
        .expect(200);
      const list = await request(app.getHttpServer())
        .get('/chats')
        .set(asUser(USER_B))
        .expect(200);

      for (const body of [chat.body, list.body]) {
        const serialised = JSON.stringify(body);

        for (const forbidden of [
          'passwordHash',
          'password_hash',
          'email',
          'isEmailVerified',
          'isActive',
          'karma',
          'emailVerificationToken',
          'userOneId',
          'userTwoId',
        ]) {
          expect(serialised).not.toContain(forbidden);
        }
      }
    });
  });

  describe('rate limiting', () => {
    it('should reject a message flood with 429', async () => {
      const chatId = await openChat();

      for (let sent = 0; sent < CHAT_MESSAGE_RATE_LIMIT.limit; sent++) {
        await request(app.getHttpServer())
          .post(`/chats/${chatId}/messages`)
          .set(asUser(USER_A))
          .send({ content: `flood ${sent}` })
          .expect(201);
      }

      const blocked = await request(app.getHttpServer())
        .post(`/chats/${chatId}/messages`)
        .set(asUser(USER_A))
        .send({ content: 'one too many' })
        .expect(429);

      expect(blocked.body).toEqual(
        expect.objectContaining({
          success: false,
          statusCode: 429,
          message: 'Too Many Requests',
        }),
      );

      // The guard short circuits, so the flood never reached the database.
      expect(prisma.messages).toHaveLength(CHAT_MESSAGE_RATE_LIMIT.limit);
    });

    it('should keep a per user budget, so one user cannot lock another out', async () => {
      const chatId = await openChat();

      for (let sent = 0; sent < CHAT_MESSAGE_RATE_LIMIT.limit; sent++) {
        await request(app.getHttpServer())
          .post(`/chats/${chatId}/messages`)
          .set(asUser(USER_A))
          .send({ content: `flood ${sent}` })
          .expect(201);
      }

      await request(app.getHttpServer())
        .post(`/chats/${chatId}/messages`)
        .set(asUser(USER_A))
        .send({ content: 'blocked' })
        .expect(429);

      // Bob shares the IP with Alice but not the budget.
      await request(app.getHttpServer())
        .post(`/chats/${chatId}/messages`)
        .set(asUser(USER_B))
        .send({ content: 'still allowed' })
        .expect(201);
    });
  });
});
