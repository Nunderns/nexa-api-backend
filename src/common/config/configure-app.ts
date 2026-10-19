import { INestApplication } from '@nestjs/common';
import {
  json,
  urlencoded,
  static as serveStatic,
  type ErrorRequestHandler,
} from 'express';
import helmet from 'helmet';
import { SecureIoAdapter } from '../websocket/secure-io.adapter';
import { UPLOAD_DIR, UPLOAD_ROUTE } from '../../media/media-storage.config';
import { TransformInterceptor } from '../interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../filters/http-exception.filter';
import { CustomValidationPipe } from '../pipes/validation.pipe';
import { TRUST_PROXY_HOPS } from './rate-limit.config';
import { allowedOrigins, bodyLimit } from './http-security.config';

const bodyParserErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const status = (err as { status?: unknown }).status;
  const type = (err as { type?: unknown }).type;

  if (typeof status !== 'number' || typeof type !== 'string') {
    next(err);
    return;
  }

  res.status(status).json({
    success: false,
    statusCode: status,
    timestamp: new Date().toISOString(),
    path: req.url,
    message:
      type === 'entity.too.large'
        ? 'Request body too large'
        : 'Malformed request body',
  });
};

export function configureApp(app: INestApplication): INestApplication {
  (app as unknown as { set(key: string, value: unknown): void }).set(
    'trust proxy',
    TRUST_PROXY_HOPS,
  );

  app.useGlobalPipes(new CustomValidationPipe());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.use(helmet());
  app.useWebSocketAdapter(new SecureIoAdapter(app));
  app.enableCors({
    origin: allowedOrigins(),
    // Auth is a bearer token, never a cookie.
    credentials: false,
  });

  // Registered before Nest's defaults, which then skip their own parsers.
  const limit = bodyLimit();
  app.use(json({ limit }));
  app.use(urlencoded({ limit, extended: true }));
  app.use(bodyParserErrorHandler);

  // Uploaded media. `nosniff` keeps browsers on the extension's content type,
  // which the upload filter derives from an allow-list.
  app.use(
    UPLOAD_ROUTE,
    serveStatic(UPLOAD_DIR, {
      index: false,
      fallthrough: false,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    }),
  );

  return app;
}
