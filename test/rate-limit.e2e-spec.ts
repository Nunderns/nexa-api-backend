import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { configureApp } from './../src/common/config/configure-app';
import { AUTH_RATE_LIMIT } from './../src/common/config/rate-limit.config';

/**
 * Rate limiting over real HTTP, against the real configuration.
 *
 * The app is created once (not per test) on purpose: the throttler counts
 * hits in memory per app instance, so a fresh app per test would reset the
 * counters and the limit could never be reached. For the same reason the
 * tests below are order dependent - the exhausting test must stay last.
 */
describe('Rate limit (e2e)', () => {
  let app: INestApplication<App>;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    post: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const invalidCredentials = {
    email: 'nobody@example.com',
    password: 'Wrong@Pass1',
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = configureApp(moduleFixture.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should let normal traffic through', async () => {
    mockPrismaService.post.findMany.mockResolvedValue([]);
    mockPrismaService.post.count.mockResolvedValue(0);

    await request(app.getHttpServer()).get('/posts').expect(200);
  });

  it('should reject the credentials brute force burst with 429', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);

    // Every attempt up to the limit reaches the handler and fails on the
    // credentials, exactly like a real brute force run would.
    for (let attempt = 0; attempt < AUTH_RATE_LIMIT.limit; attempt++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send(invalidCredentials)
        .expect(401);
    }

    const callsBeforeBlock =
      mockPrismaService.user.findUnique.mock.calls.length;

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(invalidCredentials)
      .expect(429);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        statusCode: 429,
        message: 'Too Many Requests',
      }),
    );

    // The blocked request never reached the service, so no extra database
    // query was issued: the guard short circuits before any real work.
    expect(mockPrismaService.user.findUnique).toHaveBeenCalledTimes(
      callsBeforeBlock,
    );

    // Tells the client when it may try again.
    expect(response.headers['retry-after']).toBeDefined();
  });
});
