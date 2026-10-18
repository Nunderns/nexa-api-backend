import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './common/config/configure-app';
import { isSwaggerEnabled } from './common/config/http-security.config';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));

  if (isSwaggerEnabled()) {
    setupSwagger(app);
  }

  await app.listen(process.env.PORT ?? 3000);
}

function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Nexa API')
    .setDescription('A Reddit-like community platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management')
    .addTag('communities', 'Community management')
    .addTag('posts', 'Post management')
    .addTag('comments', 'Comment management')
    .addTag('votes', 'Voting system')
    .addTag('media', 'Media management')
    .addTag('chats', 'One-to-one chat and messaging')
    .addTag(
      'notifications',
      'Notifications (REST). Real-time events: docs/notifications-websocket.md',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
}

void bootstrap();
