import { INestApplication } from '@nestjs/common';
import { static as serveStatic } from 'express';
import { UPLOAD_DIR, UPLOAD_ROUTE } from '../../media/media-storage.config';
import { TransformInterceptor } from '../interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../filters/http-exception.filter';
import { CustomValidationPipe } from '../pipes/validation.pipe';
import { TRUST_PROXY_HOPS } from './rate-limit.config';

export function configureApp(app: INestApplication): INestApplication {
  (app as unknown as { set(key: string, value: unknown): void }).set(
    'trust proxy',
    TRUST_PROXY_HOPS,
  );

  app.useGlobalPipes(new CustomValidationPipe());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors();

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
