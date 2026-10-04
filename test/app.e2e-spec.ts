import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { CustomValidationPipe } from './../src/common/pipes/validation.pipe';
import { TransformInterceptor } from './../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { PostType } from '@prisma/client';

/**
 * HTTP level smoke tests. Prisma is replaced by a mock so the real database is
 * never touched: the goal here is to prove that the app boots, that routing,
 * pipes and the response envelope work end to end.
 */
describe('App (e2e)', () => {
  let app: INestApplication<App>;

  const mockPrismaService = {
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

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new CustomValidationPipe());
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
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
