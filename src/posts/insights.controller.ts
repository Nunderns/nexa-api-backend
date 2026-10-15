import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  INSIGHTS_IP_RATE_LIMIT,
  POST_VIEW_IP_RATE_LIMIT,
} from '../common/config/rate-limit.config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { InsightsService } from './insights.service';
import { PostInsightsResponseDto } from './dto/post-insights-response.dto';

/**
 * Lives under `/posts` rather than a top-level `/insights` because every route
 * here is scoped to one post; a separate prefix would suggest a resource that
 * does not exist.
 */
@ApiTags('posts')
@Controller('posts')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  /**
   * Explicit view beacon, fired by the post detail page.
   *
   * Not fired on every `GET /posts/:id`: a feed that renders ten cards would
   * report ten views per scroll-through, which measures scrolling, not reach.
   * One beacon per opened post is what "views" is supposed to mean.
   *
   * Returns 200 with `counted: false` rather than 204 so the client can tell a
   * deduplicated view apart from a failed one.
   */
  @Throttle({ default: POST_VIEW_IP_RATE_LIMIT })
  @Post(':id/view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record a view for a post',
    description:
      'Counts one view unless the same visitor was already counted in the last 30 minutes. Country is read from the `x-country-code` header when an edge proxy provides it.',
  })
  @ApiOkResponse({
    description: 'View processed',
    schema: {
      type: 'object',
      properties: {
        postId: { type: 'number', example: 1 },
        counted: { type: 'boolean', example: true },
      },
    },
  })
  @ApiResponse({ status: 429, description: 'Too many view beacons' })
  async recordView(
    @Param('id', ParseIntPipe) postId: number,
    @Ip() ip: string,
    @CurrentUser('id') userId: number | undefined,
    @Headers('x-country-code') countryCode?: string,
  ): Promise<{ postId: number; counted: boolean }> {
    const counted = await this.insightsService.recordView(postId, {
      userId,
      ip,
      countryCode,
    });

    return { postId, counted };
  }

  @Throttle({ default: INSIGHTS_IP_RATE_LIMIT })
  @Get(':id/insights')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get reach and engagement insights for a post',
    description:
      'Visible to the post author and to moderators of the community it was posted in.',
  })
  @ApiOkResponse({
    description: 'Insights retrieved successfully',
    type: PostInsightsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Not signed in' })
  @ApiResponse({
    status: 403,
    description: 'Not the post author nor a community moderator',
  })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async getInsights(
    @Param('id', ParseIntPipe) postId: number,
    @CurrentUser('id') userId: number,
  ): Promise<PostInsightsResponseDto> {
    return this.insightsService.getInsights(postId, userId);
  }
}
