import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { configureApp } from './../src/common/config/configure-app';

describe('HTTP security (e2e)', () => {
  let app: INestApplication<App>;
  const env = { ...process.env };

  const mockPrismaService = {
    post: { findMany: jest.fn(), count: jest.fn() },
  };

  async function boot(overrides: Record<string, string>) {
    Object.assign(process.env, overrides);

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = configureApp(moduleFixture.createNestApplication());
    await app.init();
  }

  beforeEach(() => {
    mockPrismaService.post.findMany.mockResolvedValue([]);
    mockPrismaService.post.count.mockResolvedValue(0);
  });

  afterEach(async () => {
    await app.close();
    process.env = { ...env };
  });

  describe('helmet', () => {
    beforeEach(() => boot({}));

    it('sets the hardening headers and hides the framework', async () => {
      const response = await request(app.getHttpServer())
        .get('/posts')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('CORS', () => {
    beforeEach(() =>
      boot({
        FRONTEND_URL: 'https://nexa.example.com,https://preview.example.com',
      }),
    );

    it.each(['https://nexa.example.com', 'https://preview.example.com'])(
      'allows %s',
      async (origin) => {
        const response = await request(app.getHttpServer())
          .options('/posts')
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'POST')
          .expect(204);

        expect(response.headers['access-control-allow-origin']).toBe(origin);
      },
    );

    it('does not allow other origins', async () => {
      const response = await request(app.getHttpServer())
        .get('/posts')
        .set('Origin', 'https://evil.example.com')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('body limit', () => {
    beforeEach(() => boot({ BODY_LIMIT: '1kb' }));

    it('rejects a JSON body over the limit with 413 and the error envelope', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'a@b.com', password: 'x'.repeat(2048) })
        .expect(413);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 413,
        message: 'Request body too large',
      });
    });

    it('rejects malformed JSON with 400 and the error envelope', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email":')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 400,
        message: 'Malformed request body',
      });
    });
  });

  describe('a configured limit above the Express default', () => {
    beforeEach(() => boot({ BODY_LIMIT: '1mb' }));

    it('is not undercut by a second default parser', async () => {
      // 200kb would hit Express' built-in 100kb limit if Nest still
      // registered its own parser. Validation rejects it, but not with 413.
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'x'.repeat(200 * 1024) });

      expect(response.status).not.toBe(413);
    });
  });
});
