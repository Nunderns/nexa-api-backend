import { INestApplication } from '@nestjs/common';
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

  return app;
}
