import { INestApplication } from '@nestjs/common';
import type { ErrorRequestHandler, Request, Response } from 'express';
import { HttpExceptionFilter } from '../filters/http-exception.filter';
import { TransformInterceptor } from '../interceptors/transform.interceptor';
import { CustomValidationPipe } from '../pipes/validation.pipe';
import { SecureIoAdapter } from '../websocket/secure-io.adapter';
import { configureApp } from './configure-app';

/**
 * Wiring only; the HTTP behaviour of the same setup is exercised end to end in
 * `test/http-security.e2e-spec.ts`.
 */
describe('configureApp', () => {
  const app = {
    set: jest.fn(),
    useGlobalPipes: jest.fn(),
    useGlobalInterceptors: jest.fn(),
    useGlobalFilters: jest.fn(),
    useWebSocketAdapter: jest.fn(),
    enableCors: jest.fn(),
    use: jest.fn(),
  };

  beforeAll(() => {
    configureApp(app as unknown as INestApplication);
  });

  it('installs the global pipe, interceptor, filter and socket adapter', () => {
    expect(app.useGlobalPipes).toHaveBeenCalledWith(
      expect.any(CustomValidationPipe),
    );
    expect(app.useGlobalInterceptors).toHaveBeenCalledWith(
      expect.any(TransformInterceptor),
    );
    expect(app.useGlobalFilters).toHaveBeenCalledWith(
      expect.any(HttpExceptionFilter),
    );
    expect(app.useWebSocketAdapter).toHaveBeenCalledWith(
      expect.any(SecureIoAdapter),
    );
    expect(app.set).toHaveBeenCalledWith('trust proxy', expect.anything());
    expect(app.enableCors).toHaveBeenCalledWith(
      expect.objectContaining({ credentials: false }),
    );
  });

  describe('body parser errors', () => {
    // Express tells error handlers apart by their four parameters.
    const handler = () =>
      app.use.mock.calls
        .map(([fn]: [unknown]) => fn)
        .find(
          (fn): fn is ErrorRequestHandler =>
            typeof fn === 'function' && fn.length === 4,
        )!;

    function handle(err: unknown) {
      const json = jest.fn();
      const res = { status: jest.fn().mockReturnValue({ json }) };
      const next = jest.fn();
      handler()(
        err,
        { url: '/posts' } as Request,
        res as unknown as Response,
        next,
      );
      return {
        status: res.status.mock.calls[0]?.[0],
        body: json.mock.calls[0]?.[0],
        next,
      };
    }

    it('answers 413 for an oversized body', () => {
      const { status, body } = handle({
        status: 413,
        type: 'entity.too.large',
      });

      expect(status).toBe(413);
      expect(body).toMatchObject({
        success: false,
        path: '/posts',
        message: 'Request body too large',
      });
    });

    it('answers 400 for malformed JSON', () => {
      const { status, body } = handle({
        status: 400,
        type: 'entity.parse.failed',
      });

      expect(status).toBe(400);
      expect(body.message).toBe('Malformed request body');
    });

    it('passes any other error on', () => {
      const err = new Error('boom');
      const { status, next } = handle(err);

      expect(status).toBeUndefined();
      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
