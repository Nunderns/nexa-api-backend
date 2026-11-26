import { unlink } from 'fs/promises';
import { basename, join } from 'path';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { visibleCommunityWhere } from '../posts/post-visibility';
import { UPLOAD_DIR } from '../media/media-storage.config';

/** Shown in place of anything a deleted account wrote. */
export const DELETED_PLACEHOLDER = '[deleted]';

export const PUBLIC_USER_FIELDS = {
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

  /**
   * Erases the account (LGPD art. 18, VI).
   *
   * The `users` row is kept as an anonymized tombstone rather than deleted:
   * its foreign keys cascade, so a hard delete would also take down the chats
   * (and the other participant's messages) and every reply thread under the
   * user's posts. Everything that identifies the person is wiped instead:
   * profile fields, credentials, sessions, posts and comments content, sent
   * messages, uploaded media, memberships and notifications. Votes stay, tied
   * to the tombstone, so scores and karma remain correct.
   */
  async remove(
    id: number,
    currentUserId: number,
    password: string,
  ): Promise<void> {
    if (id !== currentUserId) {
      throw new ForbiddenException('You can only delete your own account');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid password');
    }

    const storageKeys = await this.prisma.$transaction(async (tx) => {
      // Conditional on `isActive` so that a concurrent second request finds
      // nothing left to do and cannot decrement the counters twice.
      const { count } = await tx.user.updateMany({
        where: { id, isActive: true },
        data: {
          username: `deleted_${id}`,
          email: `deleted_${id}@deleted.invalid`,
          // Not a bcrypt hash, so no password can ever match it.
          passwordHash: '!',
          displayName: DELETED_PLACEHOLDER,
          bio: null,
          avatarUrl: null,
          isActive: false,
          isEmailVerified: false,
          emailVerificationToken: null,
          emailVerificationExpires: null,
          updatedAt: new Date(),
        },
      });

      if (count === 0) return [];

      // Posts and comments are soft-deleted per parent, each counter
      // decremented by exactly the rows this statement flipped.
      const livePosts = await tx.post.groupBy({
        by: ['communityId'],
        where: { authorId: id, isDeleted: false },
      });
      for (const { communityId } of livePosts) {
        const flipped = await tx.post.updateMany({
          where: { authorId: id, communityId, isDeleted: false },
          data: { isDeleted: true },
        });
        if (flipped.count > 0) {
          await tx.community.update({
            where: { id: communityId },
            data: { postCount: { decrement: flipped.count } },
          });
        }
      }

      const liveComments = await tx.comment.groupBy({
        by: ['postId'],
        where: { authorId: id, isDeleted: false },
      });
      for (const { postId } of liveComments) {
        const flipped = await tx.comment.updateMany({
          where: { authorId: id, postId, isDeleted: false },
          data: { isDeleted: true },
        });
        if (flipped.count > 0) {
          await tx.post.update({
            where: { id: postId },
            data: { commentCount: { decrement: flipped.count } },
          });
        }
      }

      await tx.post.updateMany({
        where: { authorId: id },
        data: { title: DELETED_PLACEHOLDER, content: null },
      });
      await tx.comment.updateMany({
        where: { authorId: id },
        data: { content: DELETED_PLACEHOLDER },
      });

      // A banned member was already taken off `memberCount` by the ban.
      const memberships = await tx.communityMember.findMany({
        where: { userId: id, bannedAt: null },
        select: { communityId: true },
      });
      for (const { communityId } of memberships) {
        const removed = await tx.communityMember.deleteMany({
          where: { communityId, userId: id, bannedAt: null },
        });
        if (removed.count > 0) {
          await tx.community.update({
            where: { id: communityId },
            data: { memberCount: { decrement: removed.count } },
          });
        }
      }
      await tx.communityMember.deleteMany({ where: { userId: id } });

      // Notifications triggered by the user carry their username in the
      // title/body of someone else's inbox, so those go too.
      await tx.notification.deleteMany({
        where: { OR: [{ recipientId: id }, { actorId: id }] },
      });
      await tx.notificationPreference.deleteMany({ where: { userId: id } });
      await tx.message.deleteMany({ where: { senderId: id } });
      await tx.refreshToken.deleteMany({ where: { userId: id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: id } });

      const media = await tx.media.findMany({
        where: { userId: id },
        select: { storageKey: true },
      });
      await tx.media.deleteMany({ where: { userId: id } });

      return media.map((item) => item.storageKey);
    });

    // Files are removed only once the rows are gone. `basename` keeps a
    // client-supplied storage key from pointing outside the upload directory,
    // and a key with no file behind it (legacy JSON uploads) is ignored.
    await Promise.all(
      storageKeys.map((key) =>
        unlink(join(UPLOAD_DIR, basename(key))).catch(() => undefined),
      ),
    );
  }

  /** Everything stored about the user, for the LGPD portability right. */
  async exportData(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        karma: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
        communitiesCreated: {
          select: { id: true, name: true, displayName: true, createdAt: true },
        },
        communityMemberships: {
          select: { communityId: true, role: true, joinedAt: true },
        },
        posts: {
          select: {
            id: true,
            communityId: true,
            title: true,
            content: true,
            postType: true,
            isDeleted: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        comments: {
          select: {
            id: true,
            postId: true,
            parentId: true,
            content: true,
            isDeleted: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        postVotes: { select: { postId: true, vote: true, createdAt: true } },
        commentVotes: {
          select: { commentId: true, vote: true, createdAt: true },
        },
        sentMessages: {
          select: { id: true, chatId: true, content: true, createdAt: true },
        },
        media: {
          select: {
            id: true,
            postId: true,
            commentId: true,
            url: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
        notificationsReceived: {
          select: {
            id: true,
            type: true,
            title: true,
            body: true,
            isRead: true,
            createdAt: true,
          },
        },
        notificationPreference: {
          select: {
            postReplies: true,
            commentReplies: true,
            mentions: true,
            votes: true,
            directMessages: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      exportedAt: new Date(),
      ...user,
      // `sizeBytes` is a BigInt column, which `JSON.stringify` cannot encode.
      media: user.media.map((item) => ({
        ...item,
        sizeBytes: Number(item.sizeBytes),
      })),
    };
  }

  async getUserPosts(
    userId: number,
    page: number = 1,
    limit: number = 20,
    viewerId?: number,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      authorId: userId,
      isDeleted: false,
      community: visibleCommunityWhere(viewerId),
    };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
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
      this.prisma.post.count({ where }),
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
