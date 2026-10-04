import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { VotesService } from './votes.service';
import { VoteDto } from './dto/vote.dto';
import { PostVoteResponseDto } from './dto/post-vote-response.dto';
import { CommentVoteResponseDto } from './dto/comment-vote-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('votes')
@Controller('votes')
export class VotesController {
  constructor(private readonly votesService: VotesService) {}

  @Post('post/:postId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vote on a post' })
  @ApiResponse({
    status: 200,
    description: 'Vote recorded successfully',
    type: PostVoteResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async voteOnPost(
    @Param('postId') postId: string,
    @Body() voteDto: VoteDto,
    @CurrentUser('id') userId: number,
  ): Promise<PostVoteResponseDto> {
    return this.votesService.voteOnPost(+postId, voteDto, userId);
  }

  @Get('post/:postId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user vote on post' })
  @ApiResponse({
    status: 200,
    description: 'Vote retrieved successfully',
    type: PostVoteResponseDto,
  })
  async getPostVote(
    @Param('postId') postId: string,
    @CurrentUser('id') userId: number,
  ): Promise<PostVoteResponseDto | null> {
    return this.votesService.getPostVote(+postId, userId);
  }

  @Post('comment/:commentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vote on a comment' })
  @ApiResponse({
    status: 200,
    description: 'Vote recorded successfully',
    type: CommentVoteResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  async voteOnComment(
    @Param('commentId') commentId: string,
    @Body() voteDto: VoteDto,
    @CurrentUser('id') userId: number,
  ): Promise<CommentVoteResponseDto> {
    return this.votesService.voteOnComment(+commentId, voteDto, userId);
  }

  @Get('comment/:commentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user vote on comment' })
  @ApiResponse({
    status: 200,
    description: 'Vote retrieved successfully',
    type: CommentVoteResponseDto,
  })
  async getCommentVote(
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: number,
  ): Promise<CommentVoteResponseDto | null> {
    return this.votesService.getCommentVote(+commentId, userId);
  }
}
