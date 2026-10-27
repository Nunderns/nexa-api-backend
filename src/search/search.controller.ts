import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { GLOBAL_RATE_LIMIT } from '../common/config/rate-limit.config';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Throttle({ default: GLOBAL_RATE_LIMIT })
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Full-text search',
    description:
      'Searches posts, communities or users. Every word must match and the last one may be a prefix. Posts from private communities are included only for their members.',
  })
  @ApiResponse({ status: 200, description: 'Results retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Missing term or unknown type' })
  async search(
    @Query() query: SearchQueryDto,
    @CurrentUser('id') viewerId?: number,
  ) {
    return this.searchService.search({
      q: query.q,
      type: query.type ?? 'posts',
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      viewerId,
    });
  }
}
