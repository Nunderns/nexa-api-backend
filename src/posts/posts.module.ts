import { Module } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';
import { PopularFeedController } from './popular-feed.controller';
import { PopularFeedService } from './popular-feed.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  // `GET /posts/:id/insights` is a distinct path shape from `GET /posts/:id`,
  // so Express matches it independently of registration order.
  // `GET /posts/popular` is not: it must be registered before `GET /posts/:id`
  // or that route would claim `popular` as an id.
  controllers: [PopularFeedController, PostsController, InsightsController],
  providers: [PostsService, InsightsService, PopularFeedService],
  exports: [PostsService, InsightsService],
})
export class PostsModule {}
