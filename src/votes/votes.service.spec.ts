import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { VotesService } from './votes.service';
import { PrismaService } from '../prisma/prisma.service';

describe('VotesService', () => {
  let service: VotesService;

  const mockPrismaService = {
    post: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    postVote: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    comment: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    commentVote: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
  };

  const mockPost = {
    id: 1,
    authorId: 7,
    score: 0,
    isDeleted: false,
  };

  const mockComment = {
    id: 10,
    postId: 1,
    authorId: 7,
    score: 0,
    isDeleted: false,
  };

  const mockVote = {
    userId: 1,
    postId: 1,
    vote: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<VotesService>(VotesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('voteOnPost', () => {
    it('should register a new upvote and reward the post author karma', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.postVote.findUnique.mockResolvedValue(null);
      mockPrismaService.postVote.create.mockResolvedValue(mockVote);

      const result = await service.voteOnPost(1, { vote: 1 }, 1);

      expect(result).toEqual(mockVote);
      expect(mockPrismaService.postVote.create).toHaveBeenCalledWith({
        data: { userId: 1, postId: 1, vote: 1 },
      });
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          score: { increment: 1 },
          upvoteCount: { increment: 1 },
          downvoteCount: undefined,
        },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { karma: { increment: 1 } },
      });
    });

    it('should register a new downvote without touching the upvote counter', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.postVote.findUnique.mockResolvedValue(null);
      mockPrismaService.postVote.create.mockResolvedValue({
        ...mockVote,
        vote: -1,
      });

      await service.voteOnPost(1, { vote: -1 }, 1);

      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          score: { increment: -1 },
          upvoteCount: undefined,
          downvoteCount: { increment: 1 },
        },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { karma: { increment: -1 } },
      });
    });

    it('should throw NotFoundException if post not found', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(service.voteOnPost(1, { vote: 1 }, 1)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.postVote.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if post is deleted', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPost,
        isDeleted: true,
      });

      await expect(service.voteOnPost(1, { vote: 1 }, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException voting 0 without an existing vote', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.postVote.findUnique.mockResolvedValue(null);

      await expect(service.voteOnPost(1, { vote: 0 }, 1)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrismaService.postVote.create).not.toHaveBeenCalled();
    });

    it('should remove an existing upvote when voting 0', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.postVote.findUnique.mockResolvedValue(mockVote);
      mockPrismaService.postVote.delete.mockResolvedValue(mockVote);

      const result = await service.voteOnPost(1, { vote: 0 }, 1);

      expect(result).toEqual(mockVote);
      expect(mockPrismaService.postVote.delete).toHaveBeenCalledWith({
        where: { userId_postId: { userId: 1, postId: 1 } },
      });
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          score: { decrement: 1 },
          upvoteCount: { decrement: 1 },
          downvoteCount: undefined,
        },
      });
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should flip an upvote to a downvote moving both counters', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.postVote.findUnique.mockResolvedValue(mockVote);
      mockPrismaService.postVote.update.mockResolvedValue({
        ...mockVote,
        vote: -1,
      });

      await service.voteOnPost(1, { vote: -1 }, 1);

      expect(mockPrismaService.postVote.update).toHaveBeenCalledWith({
        where: { userId_postId: { userId: 1, postId: 1 } },
        data: { vote: -1 },
      });
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          score: { increment: -2 },
          upvoteCount: { decrement: 1 },
          downvoteCount: { increment: 1 },
        },
      });
    });

    it('should keep the score unchanged when repeating the same vote', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.postVote.findUnique.mockResolvedValue(mockVote);
      mockPrismaService.postVote.update.mockResolvedValue(mockVote);

      await service.voteOnPost(1, { vote: 1 }, 1);

      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          score: { increment: 0 },
          upvoteCount: undefined,
          downvoteCount: undefined,
        },
      });
    });
  });

  describe('voteOnComment', () => {
    it('should register a new upvote and reward the comment author karma', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(mockComment);
      mockPrismaService.commentVote.findUnique.mockResolvedValue(null);
      mockPrismaService.commentVote.create.mockResolvedValue({
        userId: 1,
        commentId: 10,
        vote: 1,
      });

      const result = await service.voteOnComment(10, { vote: 1 }, 1);

      expect(result).toEqual({
        userId: 1,
        commentId: 10,
        vote: 1,
      });
      expect(mockPrismaService.commentVote.create).toHaveBeenCalledWith({
        data: { userId: 1, commentId: 10, vote: 1 },
      });
      expect(mockPrismaService.comment.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: {
          score: { increment: 1 },
          upvoteCount: { increment: 1 },
          downvoteCount: undefined,
        },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { karma: { increment: 1 } },
      });
    });

    it('should throw NotFoundException if comment not found', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(null);

      await expect(service.voteOnComment(10, { vote: 1 }, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if comment is deleted', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue({
        ...mockComment,
        isDeleted: true,
      });

      await expect(service.voteOnComment(10, { vote: 1 }, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException voting 0 without an existing vote', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(mockComment);
      mockPrismaService.commentVote.findUnique.mockResolvedValue(null);

      await expect(service.voteOnComment(10, { vote: 0 }, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should remove an existing downvote when voting 0', async () => {
      const downvote = { userId: 1, commentId: 10, vote: -1 };

      mockPrismaService.comment.findUnique.mockResolvedValue(mockComment);
      mockPrismaService.commentVote.findUnique.mockResolvedValue(downvote);
      mockPrismaService.commentVote.delete.mockResolvedValue(downvote);

      await service.voteOnComment(10, { vote: 0 }, 1);

      expect(mockPrismaService.commentVote.delete).toHaveBeenCalledWith({
        where: { userId_commentId: { userId: 1, commentId: 10 } },
      });
      expect(mockPrismaService.comment.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: {
          score: { decrement: -1 },
          upvoteCount: undefined,
          downvoteCount: { decrement: 1 },
        },
      });
    });
  });

  describe('getPostVote', () => {
    it('should return the vote of the user on a post', async () => {
      mockPrismaService.postVote.findUnique.mockResolvedValue(mockVote);

      const result = await service.getPostVote(1, 1);

      expect(result).toEqual(mockVote);
      expect(mockPrismaService.postVote.findUnique).toHaveBeenCalledWith({
        where: { userId_postId: { userId: 1, postId: 1 } },
      });
    });

    it('should return null when the user has not voted', async () => {
      mockPrismaService.postVote.findUnique.mockResolvedValue(null);

      await expect(service.getPostVote(1, 1)).resolves.toBeNull();
    });
  });

  describe('getCommentVote', () => {
    it('should return the vote of the user on a comment', async () => {
      const vote = { userId: 1, commentId: 10, vote: -1 };

      mockPrismaService.commentVote.findUnique.mockResolvedValue(vote);

      const result = await service.getCommentVote(10, 1);

      expect(result).toEqual(vote);
      expect(mockPrismaService.commentVote.findUnique).toHaveBeenCalledWith({
        where: { userId_commentId: { userId: 1, commentId: 10 } },
      });
    });

    it('should return null when the user has not voted', async () => {
      mockPrismaService.commentVote.findUnique.mockResolvedValue(null);

      await expect(service.getCommentVote(10, 1)).resolves.toBeNull();
    });
  });
});
