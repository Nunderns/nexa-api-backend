import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GLOBAL_RATE_LIMIT } from '../common/config/rate-limit.config';
import { PopularFeedQueryDto } from './dto/popular-feed-query.dto';
import { PopularFeedService } from './popular-feed.service';

@ApiTags('posts')
@Controller('posts/popular')
export class PopularFeedController {
  constructor(private readonly popularFeed: PopularFeedService) {}

  @Throttle({ default: GLOBAL_RATE_LIMIT })
  @Get()
  @ApiOperation({
    summary: 'Popular timeline',
    description:
      'Posts from public, non-NSFW communities. `geo` keeps posts read from that country.',
  })
  @ApiResponse({ status: 200, description: 'Posts retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Unknown sort, window or country' })
  async find(@Query() query: PopularFeedQueryDto) {
    return this.popularFeed.find({
      sort: query.sort ?? 'hot',
      t: query.t ?? 'day',
      geo: query.geo,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }
}
