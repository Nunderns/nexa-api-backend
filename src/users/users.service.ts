import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

const PUBLIC_USER_FIELDS = {
  id: true,
  username: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  karma: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        select: PUBLIC_USER_FIELDS,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    return {
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number, viewerId?: number): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { ...PUBLIC_USER_FIELDS, email: id === viewerId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByUsername(
    username: string,
    viewerId?: number,
  ): Promise<UserResponseDto> {
    // The id is only known after the lookup, so the email is read and then
    // dropped for anyone but the owner.
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { ...PUBLIC_USER_FIELDS, email: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { email, ...publicUser } = user;
    return user.id === viewerId ? { ...publicUser, email } : publicUser;
  }

  async update(
    id: number,
    updateUserDto: UpdateUserDto,
    currentUserId: number,
  ): Promise<UserResponseDto> {
    if (id !== currentUserId) {
      throw new ForbiddenException('You can only update your own profile');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      // Only the owner can get here, so the email is theirs to see.
      select: { ...PUBLIC_USER_FIELDS, email: true },
    });

    return user;
  }

  async remove(id: number, currentUserId: number): Promise<void> {
    if (id !== currentUserId) {
      throw new ForbiddenException('You can only delete your own account');
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getUserPosts(userId: number, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: { authorId: userId, isDeleted: false },
        skip,
        take: limit,
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
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.post.count({
        where: { authorId: userId, isDeleted: false },
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

  async getUserComments(userId: number, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: { authorId: userId, isDeleted: false },
        skip,
        take: limit,
        include: {
          post: {
            select: {
              id: true,
              title: true,
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
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.comment.count({
        where: { authorId: userId, isDeleted: false },
      }),
    ]);

    return {
      data: comments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserUpvoted(userId: number, page: number = 1, limit: number = 20) {
    return this.getUserVotedPosts(userId, 1, page, limit);
  }

  async getUserDownvoted(userId: number, page: number = 1, limit: number = 20) {
    return this.getUserVotedPosts(userId, -1, page, limit);
  }

  private async getUserVotedPosts(
    userId: number,
    vote: number,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    const where = { userId, vote, post: { isDeleted: false } };

    const [votes, total] = await Promise.all([
      this.prisma.postVote.findMany({
        where,
        skip,
        take: limit,
        include: {
          post: {
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
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.postVote.count({ where }),
    ]);

    return {
      data: votes.map((entry) => entry.post),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
