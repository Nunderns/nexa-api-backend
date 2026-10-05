import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './common/config/configure-app';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));

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
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
