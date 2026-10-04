import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { CommunityResponseDto } from './dto/community-response.dto';
import { JoinCommunityDto } from './dto/join-community.dto';
import { CommunityRole } from '@prisma/client';

@Injectable()
export class CommunitiesService {
  constructor(private prisma: PrismaService) {}

  async create(
    createCommunityDto: CreateCommunityDto,
    userId: number,
  ): Promise<CommunityResponseDto> {
    const existingCommunity = await this.prisma.community.findUnique({
      where: { name: createCommunityDto.name },
    });

    if (existingCommunity) {
      throw new ConflictException('Community name already exists');
    }

    const community = await this.prisma.community.create({
      data: {
        ...createCommunityDto,
        createdBy: userId,
      },
    });

    await this.prisma.communityMember.create({
      data: {
        communityId: community.id,
        userId,
        role: CommunityRole.OWNER,
      },
    });

    return community;
  }

  async findAll(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [communities, total] = await Promise.all([
      this.prisma.community.findMany({
        skip,
        take: limit,
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        orderBy: { memberCount: 'desc' },
      }),
      this.prisma.community.count(),
    ]);

    return {
      data: communities,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number): Promise<CommunityResponseDto> {
    const community = await this.prisma.community.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    return community;
  }

  async findByName(name: string): Promise<CommunityResponseDto> {
    const community = await this.prisma.community.findUnique({
      where: { name },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    return community;
  }

  async update(
    id: number,
    updateCommunityDto: UpdateCommunityDto,
    userId: number,
  ): Promise<CommunityResponseDto> {
    const membership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId,
        },
      },
    });

    if (
      !membership ||
      (membership.role !== CommunityRole.OWNER &&
        membership.role !== CommunityRole.MODERATOR)
    ) {
      throw new ForbiddenException(
        'You must be an owner or moderator to update this community',
      );
    }

    const community = await this.prisma.community.update({
      where: { id },
      data: updateCommunityDto,
    });

    return community;
  }

  async remove(id: number, userId: number): Promise<void> {
    const membership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId,
        },
      },
    });

    if (!membership || membership.role !== CommunityRole.OWNER) {
      throw new ForbiddenException('Only the owner can delete this community');
    }

    await this.prisma.community.delete({
      where: { id },
    });
  }

  async join(id: number, userId: number, joinCommunityDto?: JoinCommunityDto) {
    const community = await this.prisma.community.findUnique({
      where: { id },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    if (community.isPrivate) {
      throw new ForbiddenException(
        'Cannot join private community without invitation',
      );
    }

    const existingMembership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId,
        },
      },
    });

    if (existingMembership) {
      if (existingMembership.bannedAt) {
        throw new ForbiddenException('You are banned from this community');
      }
      throw new ConflictException('Already a member of this community');
    }

    const membership = await this.prisma.communityMember.create({
      data: {
        communityId: id,
        userId,
        role: joinCommunityDto?.role || CommunityRole.MEMBER,
      },
    });

    await this.prisma.community.update({
      where: { id },
      data: { memberCount: { increment: 1 } },
    });

    return membership;
  }

  async leave(id: number, userId: number): Promise<void> {
    const membership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Not a member of this community');
    }

    if (membership.role === CommunityRole.OWNER) {
      throw new ForbiddenException('Owner cannot leave the community');
    }

    await this.prisma.communityMember.delete({
      where: {
        communityId_userId: {
          communityId: id,
          userId,
        },
      },
    });

    await this.prisma.community.update({
      where: { id },
      data: { memberCount: { decrement: 1 } },
    });
  }

  async getMembers(id: number, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [members, total] = await Promise.all([
      this.prisma.communityMember.findMany({
        where: { communityId: id, bannedAt: null },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              karma: true,
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.communityMember.count({
        where: { communityId: id, bannedAt: null },
      }),
    ]);

    return {
      data: members,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateMemberRole(
    communityId: number,
    userId: number,
    role: CommunityRole,
    currentUserId: number,
  ) {
    const currentMembership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: currentUserId,
        },
      },
    });

    if (!currentMembership || currentMembership.role !== CommunityRole.OWNER) {
      throw new ForbiddenException('Only the owner can update member roles');
    }

    if (userId === currentUserId) {
      throw new ForbiddenException('Cannot change your own role');
    }

    const membership = await this.prisma.communityMember.update({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
      data: { role },
    });

    return membership;
  }

  async banMember(communityId: number, userId: number, currentUserId: number) {
    const currentMembership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: currentUserId,
        },
      },
    });

    if (
      !currentMembership ||
      (currentMembership.role !== CommunityRole.OWNER &&
        currentMembership.role !== CommunityRole.MODERATOR)
    ) {
      throw new ForbiddenException(
        'Only owners and moderators can ban members',
      );
    }

    if (userId === currentUserId) {
      throw new ForbiddenException('Cannot ban yourself');
    }

    const membership = await this.prisma.communityMember.update({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
      data: { bannedAt: new Date() },
    });

    await this.prisma.community.update({
      where: { id: communityId },
      data: { memberCount: { decrement: 1 } },
    });

    return membership;
  }
}
