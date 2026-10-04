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
  ApiQuery,
} from '@nestjs/swagger';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostResponseDto } from './dto/post-response.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new post' })
  @ApiResponse({
    status: 201,
    description: 'Post created successfully',
    type: PostResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Must be a member of the community',
  })
  async create(
    @Body() createPostDto: CreatePostDto,
    @CurrentUser('id') userId: number,
  ): Promise<PostResponseDto> {
    return this.postsService.create(createPostDto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all posts' })
  @ApiQuery({ name: 'sortBy', enum: ['hot', 'new', 'top'], required: false })
  @ApiResponse({ status: 200, description: 'Posts retrieved successfully' })
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('sortBy') sortBy: string = 'hot',
  ) {
    return this.postsService.findAll(pagination.page, pagination.limit, sortBy);
  }

  @Get('community/:communityId')
  @ApiOperation({ summary: 'Get posts by community' })
  @ApiQuery({ name: 'sortBy', enum: ['hot', 'new', 'top'], required: false })
  @ApiResponse({ status: 200, description: 'Posts retrieved successfully' })
  async findByCommunity(
    @Param('communityId') communityId: string,
    @Query() pagination: PaginationDto,
    @Query('sortBy') sortBy: string = 'hot',
  ) {
    return this.postsService.findByCommunity(
      +communityId,
      pagination.page,
      pagination.limit,
      sortBy,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get post by ID' })
  @ApiResponse({
    status: 200,
    description: 'Post retrieved successfully',
    type: PostResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async findOne(@Param('id') id: string): Promise<PostResponseDto> {
    return this.postsService.findOne(+id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update post' })
  @ApiResponse({
    status: 200,
    description: 'Post updated successfully',
    type: PostResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Can only edit own posts' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async update(
    @Param('id') id: string,
    @Body() updatePostDto: UpdatePostDto,
    @CurrentUser('id') userId: number,
  ): Promise<PostResponseDto> {
    return this.postsService.update(+id, updatePostDto, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete post' })
  @ApiResponse({ status: 204, description: 'Post deleted successfully' })
  @ApiResponse({ status: 403, description: 'Can only delete own posts' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
  ): Promise<void> {
    return this.postsService.remove(+id, userId);
  }

  @Post(':id/pin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pin a post' })
  @ApiResponse({ status: 200, description: 'Post pinned successfully' })
  @ApiResponse({
    status: 403,
    description: 'Only owners and moderators can pin',
  })
  async pin(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
  ): Promise<PostResponseDto> {
    return this.postsService.pin(+id, userId);
  }

  @Post(':id/unpin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unpin a post' })
  @ApiResponse({ status: 200, description: 'Post unpinned successfully' })
  @ApiResponse({
    status: 403,
    description: 'Only owners and moderators can unpin',
  })
  async unpin(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
  ): Promise<PostResponseDto> {
    return this.postsService.unpin(+id, userId);
  }

  @Post(':id/lock')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lock a post' })
  @ApiResponse({ status: 200, description: 'Post locked successfully' })
  @ApiResponse({
    status: 403,
    description: 'Only owners and moderators can lock',
  })
  async lock(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
  ): Promise<PostResponseDto> {
    return this.postsService.lock(+id, userId);
  }

  @Post(':id/unlock')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unlock a post' })
  @ApiResponse({ status: 200, description: 'Post unlocked successfully' })
  @ApiResponse({
    status: 403,
    description: 'Only owners and moderators can unlock',
  })
  async unlock(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
  ): Promise<PostResponseDto> {
    return this.postsService.unlock(+id, userId);
  }
}
