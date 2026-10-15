import { Module } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  // `GET /posts/:id/insights` is a distinct path shape from `GET /posts/:id`,
  // so Express matches it independently of registration order.
  controllers: [PostsController, InsightsController],
  providers: [PostsService, InsightsService],
  exports: [PostsService, InsightsService],
})
export class PostsModule {}
