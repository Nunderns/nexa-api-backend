import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VoteDto } from './dto/vote.dto';
import { PostVoteResponseDto } from './dto/post-vote-response.dto';
import { CommentVoteResponseDto } from './dto/comment-vote-response.dto';

@Injectable()
export class VotesService {
  constructor(private prisma: PrismaService) {}

  async voteOnPost(
    postId: number,
    voteDto: VoteDto,
    userId: number,
  ): Promise<PostVoteResponseDto> {
    const { vote } = voteDto;

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.isDeleted) {
      throw new NotFoundException('Post has been deleted');
    }

    const existingVote = await this.prisma.postVote.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    if (existingVote) {
      if (vote === 0) {
        await this.prisma.postVote.delete({
          where: {
            userId_postId: {
              userId,
              postId,
            },
          },
        });

        await this.prisma.post.update({
          where: { id: postId },
          data: {
            score: { decrement: existingVote.vote },
            upvoteCount: existingVote.vote > 0 ? { decrement: 1 } : undefined,
            downvoteCount: existingVote.vote < 0 ? { decrement: 1 } : undefined,
          },
        });

        return existingVote;
      }

      const voteDifference = vote - existingVote.vote;

      const updatedVote = await this.prisma.postVote.update({
        where: {
          userId_postId: {
            userId,
            postId,
          },
        },
        data: { vote },
      });

      await this.prisma.post.update({
        where: { id: postId },
        data: {
          score: { increment: voteDifference },
          upvoteCount:
            vote > 0 && existingVote.vote <= 0
              ? { increment: 1 }
              : vote <= 0 && existingVote.vote > 0
                ? { decrement: 1 }
                : undefined,
          downvoteCount:
            vote < 0 && existingVote.vote >= 0
              ? { increment: 1 }
              : vote >= 0 && existingVote.vote < 0
                ? { decrement: 1 }
                : undefined,
        },
      });

      return updatedVote;
    }

    if (vote === 0) {
      throw new ForbiddenException(
        'Cannot vote 0 on a post without an existing vote',
      );
    }

    const newVote = await this.prisma.postVote.create({
      data: {
        userId,
        postId,
        vote,
      },
    });

    await this.prisma.post.update({
      where: { id: postId },
      data: {
        score: { increment: vote },
        upvoteCount: vote > 0 ? { increment: 1 } : undefined,
        downvoteCount: vote < 0 ? { increment: 1 } : undefined,
      },
    });

    await this.prisma.user.update({
      where: { id: post.authorId },
      data: { karma: { increment: vote } },
    });

    return newVote;
  }

  async voteOnComment(
    commentId: number,
    voteDto: VoteDto,
    userId: number,
  ): Promise<CommentVoteResponseDto> {
    const { vote } = voteDto;

    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.isDeleted) {
      throw new NotFoundException('Comment has been deleted');
    }

    const existingVote = await this.prisma.commentVote.findUnique({
      where: {
        userId_commentId: {
          userId,
          commentId,
        },
      },
    });

    if (existingVote) {
      if (vote === 0) {
        await this.prisma.commentVote.delete({
          where: {
            userId_commentId: {
              userId,
              commentId,
            },
          },
        });

        await this.prisma.comment.update({
          where: { id: commentId },
          data: {
            score: { decrement: existingVote.vote },
            upvoteCount: existingVote.vote > 0 ? { decrement: 1 } : undefined,
            downvoteCount: existingVote.vote < 0 ? { decrement: 1 } : undefined,
          },
        });

        return existingVote;
      }

      const voteDifference = vote - existingVote.vote;

      const updatedVote = await this.prisma.commentVote.update({
        where: {
          userId_commentId: {
            userId,
            commentId,
          },
        },
        data: { vote },
      });

      await this.prisma.comment.update({
        where: { id: commentId },
        data: {
          score: { increment: voteDifference },
          upvoteCount:
            vote > 0 && existingVote.vote <= 0
              ? { increment: 1 }
              : vote <= 0 && existingVote.vote > 0
                ? { decrement: 1 }
                : undefined,
          downvoteCount:
            vote < 0 && existingVote.vote >= 0
              ? { increment: 1 }
              : vote >= 0 && existingVote.vote < 0
                ? { decrement: 1 }
                : undefined,
        },
      });

      return updatedVote;
    }

    if (vote === 0) {
      throw new ForbiddenException(
        'Cannot vote 0 on a comment without an existing vote',
      );
    }

    const newVote = await this.prisma.commentVote.create({
      data: {
        userId,
        commentId,
        vote,
      },
    });

    await this.prisma.comment.update({
      where: { id: commentId },
      data: {
        score: { increment: vote },
        upvoteCount: vote > 0 ? { increment: 1 } : undefined,
        downvoteCount: vote < 0 ? { increment: 1 } : undefined,
      },
    });

    await this.prisma.user.update({
      where: { id: comment.authorId },
      data: { karma: { increment: vote } },
    });

    return newVote;
  }

  async getPostVote(
    postId: number,
    userId: number,
  ): Promise<PostVoteResponseDto | null> {
    const vote = await this.prisma.postVote.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    return vote;
  }

  async getCommentVote(
    commentId: number,
    userId: number,
  ): Promise<CommentVoteResponseDto | null> {
    const vote = await this.prisma.commentVote.findUnique({
      where: {
        userId_commentId: {
          userId,
          commentId,
        },
      },
    });

    return vote;
  }
}
