import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { configureApp } from './../src/common/config/configure-app';
import { PostType } from '@prisma/client';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
    post: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockPost = {
    id: 1,
    title: 'Test Post',
    content: 'Test content',
    postType: PostType.TEXT,
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = configureApp(moduleFixture.createNestApplication());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('GET /posts', () => {
    it('should return a paginated envelope', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([mockPost]);
      mockPrismaService.post.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .get('/posts')
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(response.body).toEqual({
        data: {
          data: [mockPost],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
        success: true,
        timestamp: expect.any(String),
      });
    });

    it('should default the pagination when no query is sent', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([]);
      mockPrismaService.post.count.mockResolvedValue(0);

      await request(app.getHttpServer()).get('/posts').expect(200);

      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });
  });

  describe('GET /posts/popular', () => {
    it('is not swallowed by GET /posts/:id', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([{ total: BigInt(1) }]);
      mockPrismaService.post.findMany.mockResolvedValue([mockPost]);

      const response = await request(app.getHttpServer())
        .get('/posts/popular')
        .query({ sort: 'rising', geo: 'br' })
        .expect(200);

      expect(response.body.data).toMatchObject({ data: [mockPost], total: 1 });
      expect(mockPrismaService.post.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a country outside the list', async () => {
      await request(app.getHttpServer())
        .get('/posts/popular')
        .query({ geo: 'ZZ' })
        .expect(400);
    });
  });

  describe('GET /users/:id', () => {
    it('should return 404 when the user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get('/users/999')
        .expect(404);

      expect(response.body).toEqual(
        expect.objectContaining({
          success: false,
          statusCode: 404,
          message: 'User not found',
        }),
      );
    });
  });

  describe('GET /users/:id email visibility', () => {
    const jwtService = new JwtService({ secret: process.env.JWT_SECRET });
    const tokenFor = (userId: number) =>
      jwtService.sign({ sub: userId, email: `user${userId}@example.com` });

    beforeEach(() => {
      // Answers both the JwtStrategy lookup and the profile read, honouring
      // `select` so the test sees exactly what the service asked for.
      mockPrismaService.user.findUnique.mockImplementation(
        ({
          where,
          select,
        }: {
          where: { id: number };
          select: Record<string, boolean>;
        }) => {
          const row: Record<string, unknown> = {
            id: where.id,
            username: `user${where.id}`,
            email: `user${where.id}@example.com`,
            displayName: `User ${where.id}`,
            karma: 0,
            isActive: true,
            isEmailVerified: true,
          };
          return Promise.resolve(
            Object.fromEntries(
              Object.entries(row).filter(([key]) => select[key]),
            ),
          );
        },
      );
    });

    it('should hide the email from anonymous visitors', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/1')
        .expect(200);

      expect(response.body.data).not.toHaveProperty('email');
      expect(response.body.data).toHaveProperty('username', 'user1');
    });

    it('should hide the email from other signed-in users', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/1')
        .set('Authorization', `Bearer ${tokenFor(2)}`)
        .expect(200);

      expect(response.body.data).not.toHaveProperty('email');
    });

    it('should show the email to the user themselves', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/1')
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .expect(200);

      expect(response.body.data).toHaveProperty('email', 'user1@example.com');
    });

    it('should answer 401 to an expired token so the client refreshes', async () => {
      const expired = jwtService.sign(
        { sub: 1, email: 'user1@example.com' },
        { expiresIn: -10 },
      );

      await request(app.getHttpServer())
        .get('/users/1')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
    });
  });

  describe('protected routes', () => {
    it('should reject POST /posts without a token', async () => {
      await request(app.getHttpServer()).post('/posts').expect(401);
    });

    it('should reject POST /auth/login with an invalid payload', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(response.body).toEqual(
        expect.objectContaining({ success: false, statusCode: 400 }),
      );
    });

    it('should tell which field was rejected instead of a bare "Validation failed"', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'nunderns',
          email: 'jhonas.silvera@example.com',
          password: 'change@me',
          displayName: 'Jhonas Silvera',
        })
        .expect(400);

      expect(response.body).toEqual(
        expect.objectContaining({
          success: false,
          statusCode: 400,
          path: '/auth/register',
          message: 'Validation failed',
        }),
      );
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Password must contain'),
        ]),
      );
    });
  });
});
