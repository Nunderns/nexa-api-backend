import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentResponseDto } from './dto/comment-response.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('comments')
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new comment' })
  @ApiResponse({
    status: 201,
    description: 'Comment created successfully',
    type: CommentResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Comments are locked on this post' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async create(
    @Body() createCommentDto: CreateCommentDto,
    @CurrentUser('id') userId: number,
  ): Promise<CommentResponseDto> {
    return this.commentsService.create(createCommentDto, userId);
  }

  @Get('post/:postId')
  @ApiOperation({ summary: 'Get comments by post' })
  @ApiResponse({ status: 200, description: 'Comments retrieved successfully' })
  async findByPost(
    @Param('postId') postId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.commentsService.findByPost(
      +postId,
      pagination.page,
      pagination.limit,
    );
  }

  @Get(':id/replies')
  @ApiOperation({ summary: 'Get comment replies' })
  @ApiResponse({ status: 200, description: 'Replies retrieved successfully' })
  async findReplies(
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.commentsService.findReplies(
      +id,
      pagination.page,
      pagination.limit,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get comment by ID' })
  @ApiResponse({
    status: 200,
    description: 'Comment retrieved successfully',
    type: CommentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  async findOne(@Param('id') id: string): Promise<CommentResponseDto> {
    return this.commentsService.findOne(+id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update comment' })
  @ApiResponse({
    status: 200,
    description: 'Comment updated successfully',
    type: CommentResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Can only edit own comments' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  async update(
    @Param('id') id: string,
    @Body() updateCommentDto: UpdateCommentDto,
    @CurrentUser('id') userId: number,
  ): Promise<CommentResponseDto> {
    return this.commentsService.update(+id, updateCommentDto, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete comment' })
  @ApiResponse({ status: 204, description: 'Comment deleted successfully' })
  @ApiResponse({ status: 403, description: 'Can only delete own comments' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
  ): Promise<void> {
    return this.commentsService.remove(+id, userId);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get user comments' })
  @ApiResponse({
    status: 200,
    description: 'User comments retrieved successfully',
  })
  async getUserComments(
    @Param('userId') userId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.commentsService.getUserComments(
      +userId,
      pagination.page,
      pagination.limit,
    );
  }
}
