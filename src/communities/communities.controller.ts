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
  ApiParam,
} from '@nestjs/swagger';
import { CommunitiesService } from './communities.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { CommunityResponseDto } from './dto/community-response.dto';
import { JoinCommunityDto } from './dto/join-community.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CommunityRole } from '@prisma/client';

@ApiTags('communities')
@Controller('communities')
export class CommunitiesController {
  constructor(private readonly communitiesService: CommunitiesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new community' })
  @ApiResponse({
    status: 201,
    description: 'Community created successfully',
    type: CommunityResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Community name already exists' })
  async create(
    @Body() createCommunityDto: CreateCommunityDto,
    @CurrentUser('id') userId: number,
  ): Promise<CommunityResponseDto> {
    return this.communitiesService.create(createCommunityDto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all communities' })
  @ApiResponse({
    status: 200,
    description: 'Communities retrieved successfully',
  })
  async findAll(@Query() pagination: PaginationDto) {
    return this.communitiesService.findAll(pagination.page, pagination.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get community by ID' })
  @ApiResponse({
    status: 200,
    description: 'Community retrieved successfully',
    type: CommunityResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Community not found' })
  async findOne(@Param('id') id: string): Promise<CommunityResponseDto> {
    return this.communitiesService.findOne(+id);
  }

  @Get('name/:name')
  @ApiOperation({ summary: 'Get community by name' })
  @ApiResponse({
    status: 200,
    description: 'Community retrieved successfully',
    type: CommunityResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Community not found' })
  async findByName(@Param('name') name: string): Promise<CommunityResponseDto> {
    return this.communitiesService.findByName(name);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update community' })
  @ApiResponse({
    status: 200,
    description: 'Community updated successfully',
    type: CommunityResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - must be owner or moderator',
  })
  @ApiResponse({ status: 404, description: 'Community not found' })
  async update(
    @Param('id') id: string,
    @Body() updateCommunityDto: UpdateCommunityDto,
    @CurrentUser('id') userId: number,
  ): Promise<CommunityResponseDto> {
    return this.communitiesService.update(+id, updateCommunityDto, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete community' })
  @ApiResponse({ status: 204, description: 'Community deleted successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - only owner can delete',
  })
  @ApiResponse({ status: 404, description: 'Community not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
  ): Promise<void> {
    return this.communitiesService.remove(+id, userId);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Join a community' })
  @ApiResponse({ status: 201, description: 'Successfully joined community' })
  @ApiResponse({ status: 403, description: 'Cannot join private community' })
  @ApiResponse({ status: 404, description: 'Community not found' })
  async join(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @Body() joinCommunityDto?: JoinCommunityDto,
  ) {
    return this.communitiesService.join(+id, userId, joinCommunityDto);
  }

  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Leave a community' })
  @ApiResponse({ status: 204, description: 'Successfully left community' })
  @ApiResponse({ status: 403, description: 'Owner cannot leave' })
  @ApiResponse({ status: 404, description: 'Not a member of this community' })
  async leave(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
  ): Promise<void> {
    return this.communitiesService.leave(+id, userId);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Get community members' })
  @ApiResponse({ status: 200, description: 'Members retrieved successfully' })
  async getMembers(
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.communitiesService.getMembers(
      +id,
      pagination.page,
      pagination.limit,
    );
  }

  @Put(':id/members/:userId/role')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update member role' })
  @ApiResponse({ status: 200, description: 'Member role updated successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - only owner can update roles',
  })
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body('role') role: CommunityRole,
    @CurrentUser('id') currentUserId: number,
  ) {
    return this.communitiesService.updateMemberRole(
      +id,
      +userId,
      role,
      currentUserId,
    );
  }

  @Post(':id/members/:userId/ban')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ban a member' })
  @ApiResponse({ status: 200, description: 'Member banned successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - only owners and moderators can ban',
  })
  async banMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser('id') currentUserId: number,
  ) {
    return this.communitiesService.banMember(+id, +userId, currentUserId);
  }
}
