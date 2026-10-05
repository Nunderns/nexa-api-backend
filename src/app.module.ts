import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CommunitiesModule } from './communities/communities.module';
import { PostsModule } from './posts/posts.module';
import { CommentsModule } from './comments/comments.module';
import { VotesModule } from './votes/votes.module';
import { MediaModule } from './media/media.module';
import { ChatModule } from './chat/chat.module';
import { GLOBAL_RATE_LIMIT } from './common/config/rate-limit.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      // Without this the guard reuses the library default message,
      // 'ThrottlerException: Too Many Requests', which leaks an internal
      // class name to API clients.
      errorMessage: 'Too Many Requests',
      throttlers: [
        {
          name: 'default',
          limit: GLOBAL_RATE_LIMIT.limit,
          ttl: GLOBAL_RATE_LIMIT.ttl,
        },
      ],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CommunitiesModule,
    PostsModule,
    CommentsModule,
    VotesModule,
    MediaModule,
    ChatModule,
  ],
  providers: [
    // Registered as a global guard so it runs before JwtAuthGuard: a flood
    // is rejected before any signature is verified or query is issued.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
