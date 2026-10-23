import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  CommentCreatedEvent,
  CommentUpdatedEvent,
  DomainEvent,
} from '../common/events/domain-events';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentResponseDto } from './dto/comment-response.dto';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async create(
    createCommentDto: CreateCommentDto,
    userId: number,
  ): Promise<CommentResponseDto> {
    const { postId, content, parentId } = createCommentDto;

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.isLocked) {
      throw new ForbiddenException('Comments are locked on this post');
    }

    if (post.isDeleted) {
      throw new NotFoundException('Post has been deleted');
    }

    const membership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: post.communityId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You must be a member of this community to comment',
      );
    }

    if (membership.bannedAt) {
      throw new ForbiddenException('You are banned from this community');
    }

    let parentAuthorId: number | null = null;

    if (parentId) {
      const parentComment = await this.prisma.comment.findUnique({
        where: { id: parentId },
      });

      if (!parentComment || parentComment.postId !== postId) {
        throw new NotFoundException(
          'Parent comment not found or does not belong to this post',
        );
      }

      parentAuthorId = parentComment.authorId;
    }

    // The comment row and the post's `commentCount` are written together so a
    // failure between the two cannot leave the counter out of step.
    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          postId,
          authorId: userId,
          content,
          parentId,
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          post: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      await tx.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      });

      return created;
    });

    this.events.emit(
      DomainEvent.CommentCreated,
      new CommentCreatedEvent(
        comment.id,
        postId,
        userId,
        content,
        post.authorId,
        parentId ?? null,
        parentAuthorId,
      ),
    );

    return comment;
  }

  async findByPost(postId: number, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: { postId, parentId: null, isDeleted: false },
        skip,
        take: limit,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          replies: {
            where: { isDeleted: false },
            include: {
              author: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatarUrl: true,
                },
              },
            },
            orderBy: { score: 'desc' },
          },
        },
        orderBy: { score: 'desc' },
      }),
      this.prisma.comment.count({
        where: { postId, parentId: null, isDeleted: false },
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

  async findReplies(commentId: number, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [replies, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: { parentId: commentId, isDeleted: false },
        skip,
        take: limit,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { score: 'desc' },
      }),
      this.prisma.comment.count({
        where: { parentId: commentId, isDeleted: false },
      }),
    ]);

    return {
      data: replies,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number): Promise<CommentResponseDto> {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        post: {
          select: {
            id: true,
            title: true,
          },
        },
        parent: {
          select: {
            id: true,
            content: true,
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    return comment;
  }

  async update(
    id: number,
    updateCommentDto: UpdateCommentDto,
    userId: number,
  ): Promise<CommentResponseDto> {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      include: { post: true, parent: { select: { authorId: true } } },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    if (comment.post.isLocked) {
      throw new ForbiddenException('Comments are locked on this post');
    }

    const updatedComment = await this.prisma.comment.update({
      where: { id },
      data: updateCommentDto,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        post: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (updateCommentDto.content !== undefined) {
      this.events.emit(
        DomainEvent.CommentUpdated,
        new CommentUpdatedEvent(
          id,
          comment.postId,
          userId,
          updateCommentDto.content,
          comment.parent ? comment.parent.authorId : comment.post.authorId,
        ),
      );
    }

    return updatedComment;
  }

  async remove(id: number, userId: number): Promise<void> {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    await this.prisma.$transaction(async (tx) => {
      // Conditional on `isDeleted: false` so that two concurrent deletes of
      // the same comment decrement `commentCount` only once.
      const { count } = await tx.comment.updateMany({
        where: { id, isDeleted: false },
        data: { isDeleted: true },
      });

      if (count === 0) return;

      await tx.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 } },
      });
    });
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
}
