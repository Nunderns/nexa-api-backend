import {
  Controller,
  Get,
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
import { Throttle } from '@nestjs/throttler';
import { GLOBAL_RATE_LIMIT } from '../common/config/rate-limit.config';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Throttle({ default: GLOBAL_RATE_LIMIT })
  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  async findAll(@Query() pagination: PaginationDto) {
    return this.usersService.findAll(pagination.page, pagination.limit);
  }

  @Throttle({ default: GLOBAL_RATE_LIMIT })
  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findOne(+id);
  }

  @Throttle({ default: GLOBAL_RATE_LIMIT })
  @Get('username/:username')
  @ApiOperation({ summary: 'Get user by username' })
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findByUsername(
    @Param('username') username: string,
  ): Promise<UserResponseDto> {
    return this.usersService.findByUsername(username);
  }

  @Throttle({ default: GLOBAL_RATE_LIMIT })
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - can only update own profile',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser('id') currentUserId: number,
  ): Promise<UserResponseDto> {
    return this.usersService.update(+id, updateUserDto, currentUserId);
  }

  @Throttle({ default: GLOBAL_RATE_LIMIT })
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate user account' })
  @ApiResponse({ status: 204, description: 'User deactivated successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - can only delete own account',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') currentUserId: number,
  ): Promise<void> {
    return this.usersService.remove(+id, currentUserId);
  }

  @Throttle({ default: GLOBAL_RATE_LIMIT })
  @Get(':id/posts')
  @ApiOperation({ summary: 'Get user posts' })
  @ApiResponse({
    status: 200,
    description: 'User posts retrieved successfully',
  })
  async getUserPosts(
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.usersService.getUserPosts(
      +id,
      pagination.page,
      pagination.limit,
    );
  }

  @Throttle({ default: GLOBAL_RATE_LIMIT })
  @Get(':id/comments')
  @ApiOperation({ summary: 'Get user comments' })
  @ApiResponse({
    status: 200,
    description: 'User comments retrieved successfully',
  })
  async getUserComments(
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.usersService.getUserComments(
      +id,
      pagination.page,
      pagination.limit,
    );
  }

  @Throttle({ default: GLOBAL_RATE_LIMIT })
  @Get(':id/upvoted')
  @ApiOperation({ summary: 'Get posts upvoted by the user' })
  @ApiResponse({
    status: 200,
    description: 'Upvoted posts retrieved successfully',
  })
  async getUserUpvoted(
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.usersService.getUserUpvoted(
      +id,
      pagination.page,
      pagination.limit,
    );
  }

  @Throttle({ default: GLOBAL_RATE_LIMIT })
  @Get(':id/downvoted')
  @ApiOperation({ summary: 'Get posts downvoted by the user' })
  @ApiResponse({
    status: 200,
    description: 'Downvoted posts retrieved successfully',
  })
  async getUserDownvoted(
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.usersService.getUserDownvoted(
      +id,
      pagination.page,
      pagination.limit,
    );
  }
}
