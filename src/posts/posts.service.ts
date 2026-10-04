import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostResponseDto } from './dto/post-response.dto';
import { CommunityRole } from '@prisma/client';

@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}

  async create(
    createPostDto: CreatePostDto,
    userId: number,
  ): Promise<PostResponseDto> {
    const { communityId, title, content, postType } = createPostDto;

    const membership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: +communityId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You must be a member of this community to post',
      );
    }

    const post = await this.prisma.post.create({
      data: {
        communityId: +communityId,
        authorId: userId,
        title,
        content,
        postType,
      },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    await this.prisma.community.update({
      where: { id: +communityId },
      data: { postCount: { increment: 1 } },
    });

    return post;
  }

  async findAll(page: number = 1, limit: number = 20, sortBy: string = 'hot') {
    const skip = (page - 1) * limit;

    let orderBy: any = { createdAt: 'desc' };

    if (sortBy === 'hot') {
      orderBy = { score: 'desc' };
    } else if (sortBy === 'new') {
      orderBy = { createdAt: 'desc' };
    } else if (sortBy === 'top') {
      orderBy = { upvoteCount: 'desc' };
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: { isDeleted: false },
        skip,
        take: limit,
        include: {
          community: {
            select: {
              id: true,
              name: true,
              displayName: true,
              iconUrl: true,
            },
          },
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy,
      }),
      this.prisma.post.count({
        where: { isDeleted: false },
      }),
    ]);

    return {
      data: posts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByCommunity(
    communityId: number,
    page: number = 1,
    limit: number = 20,
    sortBy: string = 'hot',
  ) {
    const skip = (page - 1) * limit;

    let orderBy: any = { createdAt: 'desc' };

    if (sortBy === 'hot') {
      orderBy = { score: 'desc' };
    } else if (sortBy === 'new') {
      orderBy = { createdAt: 'desc' };
    } else if (sortBy === 'top') {
      orderBy = { upvoteCount: 'desc' };
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: { communityId, isDeleted: false },
        skip,
        take: limit,
        include: {
          community: {
            select: {
              id: true,
              name: true,
              displayName: true,
              iconUrl: true,
            },
          },
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy,
      }),
      this.prisma.post.count({
        where: { communityId, isDeleted: false },
      }),
    ]);

    return {
      data: posts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number): Promise<PostResponseDto> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            displayName: true,
            iconUrl: true,
          },
        },
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        media: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  async update(
    id: number,
    updatePostDto: UpdatePostDto,
    userId: number,
  ): Promise<PostResponseDto> {
    const post = await this.prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own posts');
    }

    if (post.isLocked) {
      throw new ForbiddenException('This post is locked and cannot be edited');
    }

    const updatedPost = await this.prisma.post.update({
      where: { id },
      data: updatePostDto,
      include: {
        community: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return updatedPost;
  }

  async remove(id: number, userId: number): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    await this.prisma.post.update({
      where: { id },
      data: { isDeleted: true },
    });

    await this.prisma.community.update({
      where: { id: post.communityId },
      data: { postCount: { decrement: 1 } },
    });
  }

  async pin(id: number, userId: number): Promise<PostResponseDto> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { community: true },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const membership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: post.communityId,
          userId,
        },
      },
    });

    if (
      !membership ||
      (membership.role !== CommunityRole.OWNER &&
        membership.role !== CommunityRole.MODERATOR)
    ) {
      throw new ForbiddenException('Only owners and moderators can pin posts');
    }

    return this.prisma.post.update({
      where: { id },
      data: { isPinned: true },
    });
  }

  async unpin(id: number, userId: number): Promise<PostResponseDto> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { community: true },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const membership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: post.communityId,
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
        'Only owners and moderators can unpin posts',
      );
    }

    return this.prisma.post.update({
      where: { id },
      data: { isPinned: false },
    });
  }

  async lock(id: number, userId: number): Promise<PostResponseDto> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { community: true },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const membership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: post.communityId,
          userId,
        },
      },
    });

    if (
      !membership ||
      (membership.role !== CommunityRole.OWNER &&
        membership.role !== CommunityRole.MODERATOR)
    ) {
      throw new ForbiddenException('Only owners and moderators can lock posts');
    }

    return this.prisma.post.update({
      where: { id },
      data: { isLocked: true },
    });
  }

  async unlock(id: number, userId: number): Promise<PostResponseDto> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { community: true },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const membership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: post.communityId,
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
        'Only owners and moderators can unlock posts',
      );
    }

    return this.prisma.post.update({
      where: { id },
      data: { isLocked: false },
    });
  }
}
