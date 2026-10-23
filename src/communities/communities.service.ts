import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { CommunityResponseDto } from './dto/community-response.dto';
import { CommunityMembershipResponseDto } from './dto/community-membership-response.dto';
import { CommunityStatsResponseDto } from './dto/community-stats-response.dto';
import { CommunityRole } from '@prisma/client';
import { isUniqueViolation } from '../prisma/prisma-errors';

function startOfUtcWeek(now: Date): Date {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

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

    // Nested write: the community and its owner membership are created in one
    // statement, and `memberCount` starts at 1 because the owner is a member.
    const community = await this.prisma.community.create({
      data: {
        ...createCommunityDto,
        createdBy: userId,
        memberCount: 1,
        members: {
          create: { userId, role: CommunityRole.OWNER },
        },
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

  /**
   * Communities the user belongs to and is not banned from, i.e. the ones
   * `POST /posts` will accept. Most recently joined first.
   */
  async findJoined(userId: number, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const where = { userId, bannedAt: null };

    const [memberships, total] = await Promise.all([
      this.prisma.communityMember.findMany({
        where,
        skip,
        take: limit,
        include: {
          community: {
            include: {
              creator: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                },
              },
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
      }),
      this.prisma.communityMember.count({ where }),
    ]);

    return {
      data: memberships.map((membership) => membership.community),
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

  async join(id: number, userId: number) {
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

    try {
      return await this.prisma.$transaction(async (tx) => {
        const membership = await tx.communityMember.create({
          data: {
            communityId: id,
            userId,
            // Always MEMBER: the role is never taken from the client. Promotion
            // goes through `updateMemberRole`, which only the owner can call.
            role: CommunityRole.MEMBER,
          },
        });

        await tx.community.update({
          where: { id },
          data: { memberCount: { increment: 1 } },
        });

        return membership;
      });
    } catch (error) {
      // A concurrent join for the same user won the race on the primary key;
      // the transaction rolled back, so the counter was not touched.
      if (isUniqueViolation(error)) {
        throw new ConflictException('Already a member of this community');
      }
      throw error;
    }
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

    // A banned member was already taken off `memberCount` by the ban, and
    // deleting the row would also erase the ban and let them join again.
    if (membership.bannedAt) {
      throw new ForbiddenException('You are banned from this community');
    }

    await this.prisma.$transaction(async (tx) => {
      // Conditional delete so that two concurrent leaves (or a leave racing a
      // ban) decrement `memberCount` only once.
      const { count } = await tx.communityMember.deleteMany({
        where: {
          communityId: id,
          userId,
          bannedAt: null,
          role: { not: CommunityRole.OWNER },
        },
      });

      if (count === 0) return;

      await tx.community.update({
        where: { id },
        data: { memberCount: { decrement: 1 } },
      });
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

  async getMembership(
    communityId: number,
    userId: number,
  ): Promise<CommunityMembershipResponseDto> {
    await this.findOne(communityId);

    const membership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
    });

    const isBanned = Boolean(membership?.bannedAt);

    return {
      role: membership && !isBanned ? membership.role : null,
      isBanned,
    };
  }

  /**
   * Visitors are distinct viewers of the community's posts, since visits to
   * the community page itself are not recorded. Private communities only
   * report to their members, matching the post listing.
   */
  async getWeeklyStats(
    communityId: number,
    viewerId?: number,
  ): Promise<CommunityStatsResponseDto> {
    const community = await this.findOne(communityId);

    if (community.isPrivate) {
      const membership = viewerId
        ? await this.prisma.communityMember.findUnique({
            where: {
              communityId_userId: {
                communityId,
                userId: viewerId,
              },
            },
          })
        : null;

      if (!membership || membership.bannedAt) {
        throw new ForbiddenException(
          'You must be a member of this private community to view its stats',
        );
      }
    }

    const weekStart = startOfUtcWeek(new Date());

    const [viewers, postCount, commentCount] = await Promise.all([
      this.prisma.postView.groupBy({
        by: ['viewerKey'],
        where: { post: { communityId }, viewedAt: { gte: weekStart } },
      }),
      this.prisma.post.count({
        where: { communityId, isDeleted: false, createdAt: { gte: weekStart } },
      }),
      this.prisma.comment.count({
        where: {
          post: { communityId },
          isDeleted: false,
          createdAt: { gte: weekStart },
        },
      }),
    ]);

    return {
      weekStart,
      visitors: viewers.length,
      contributions: postCount + commentCount,
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

    // OWNER is deliberately not assignable here: a community has exactly one
    // owner, set at creation. Handing it over needs a dedicated transfer that
    // demotes the current owner in the same step.
    if (role !== CommunityRole.MEMBER && role !== CommunityRole.MODERATOR) {
      throw new BadRequestException('Role must be MEMBER or MODERATOR');
    }

    const targetMembership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
    });

    if (!targetMembership) {
      throw new NotFoundException('User is not a member of this community');
    }

    if (targetMembership.bannedAt) {
      throw new ForbiddenException('Cannot change the role of a banned member');
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
      currentMembership.bannedAt ||
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

    const targetMembership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
    });

    if (!targetMembership) {
      throw new NotFoundException('User is not a member of this community');
    }

    if (targetMembership.role === CommunityRole.OWNER) {
      throw new ForbiddenException('The owner cannot be banned');
    }

    // Moderators can ban members only; banning a moderator is the owner's call.
    if (
      targetMembership.role === CommunityRole.MODERATOR &&
      currentMembership.role !== CommunityRole.OWNER
    ) {
      throw new ForbiddenException('Only the owner can ban moderators');
    }

    if (targetMembership.bannedAt) {
      throw new ConflictException('User is already banned');
    }

    return this.prisma.$transaction(async (tx) => {
      // Conditional on `bannedAt: null` so that two concurrent bans of the
      // same member decrement `memberCount` only once.
      const { count } = await tx.communityMember.updateMany({
        where: { communityId, userId, bannedAt: null },
        data: { bannedAt: new Date() },
      });

      if (count === 0) {
        throw new ConflictException('User is already banned');
      }

      await tx.community.update({
        where: { id: communityId },
        data: { memberCount: { decrement: 1 } },
      });

      return tx.communityMember.findUniqueOrThrow({
        where: {
          communityId_userId: {
            communityId,
            userId,
          },
        },
      });
    });
  }
}
