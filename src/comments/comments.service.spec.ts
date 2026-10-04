import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CommentsService', () => {
  let service: CommentsService;

  const mockPrismaService = {
    post: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    comment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockPost = {
    id: 1,
    authorId: 1,
    title: 'Test Post',
    isLocked: false,
    isDeleted: false,
  };

  const mockComment = {
    id: 10,
    postId: 1,
    authorId: 1,
    content: 'This is a comment',
    parentId: null,
    score: 0,
    upvoteCount: 0,
    downvoteCount: 0,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    author: {
      id: 1,
      username: 'testuser',
      displayName: 'Test User',
      avatarUrl: null,
    },
    post: { id: 1, title: 'Test Post' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createCommentDto = { postId: 1, content: 'This is a comment' };

    it('should create a top level comment and increment the post counter', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.comment.create.mockResolvedValue(mockComment);
      mockPrismaService.post.update.mockResolvedValue(mockPost);

      const result = await service.create(createCommentDto, 1);

      expect(result).toEqual(mockComment);
      expect(mockPrismaService.comment.create).toHaveBeenCalledWith({
        data: {
          postId: 1,
          authorId: 1,
          content: 'This is a comment',
          parentId: undefined,
        },
        include: expect.any(Object),
      });
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { commentCount: { increment: 1 } },
      });
    });

    it('should create a reply when parentId belongs to the same post', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.comment.findUnique.mockResolvedValue({
        id: 5,
        postId: 1,
      });
      mockPrismaService.comment.create.mockResolvedValue(mockComment);
      mockPrismaService.post.update.mockResolvedValue(mockPost);

      await service.create({ ...createCommentDto, parentId: 5 }, 1);

      expect(mockPrismaService.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parentId: 5 }),
        }),
      );
    });

    it('should throw NotFoundException if post not found', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(service.create(createCommentDto, 1)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.comment.create).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if post is locked', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPost,
        isLocked: true,
      });

      await expect(service.create(createCommentDto, 1)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrismaService.comment.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if post is deleted', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPost,
        isDeleted: true,
      });

      await expect(service.create(createCommentDto, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if parent comment not found', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.comment.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ ...createCommentDto, parentId: 999 }, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if parent comment belongs to another post', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.comment.findUnique.mockResolvedValue({
        id: 5,
        postId: 42,
      });

      await expect(
        service.create({ ...createCommentDto, parentId: 5 }, 1),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.comment.create).not.toHaveBeenCalled();
    });
  });

  describe('findByPost', () => {
    it('should return only top level comments, paginated', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([mockComment]);
      mockPrismaService.comment.count.mockResolvedValue(1);

      const result = await service.findByPost(1, 1, 20);

      expect(result).toEqual({
        data: [mockComment],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(mockPrismaService.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { postId: 1, parentId: null, isDeleted: false },
          skip: 0,
          take: 20,
          orderBy: { score: 'desc' },
        }),
      );
    });

    it('should apply the skip offset for later pages', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([]);
      mockPrismaService.comment.count.mockResolvedValue(45);

      const result = await service.findByPost(1, 3, 20);

      expect(mockPrismaService.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
      expect(result.totalPages).toBe(3);
    });
  });

  describe('findReplies', () => {
    it('should return replies to a comment, paginated', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([mockComment]);
      mockPrismaService.comment.count.mockResolvedValue(1);

      const result = await service.findReplies(10, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(mockPrismaService.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { parentId: 10, isDeleted: false },
          skip: 0,
          take: 20,
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a comment by id', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(mockComment);

      const result = await service.findOne(10);

      expect(result).toEqual(mockComment);
      expect(mockPrismaService.comment.findUnique).toHaveBeenCalledWith({
        where: { id: 10 },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if comment not found', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateCommentDto = { content: 'Updated comment content' };

    it('should update a comment authored by the user', async () => {
      const updatedComment = { ...mockComment, ...updateCommentDto };

      mockPrismaService.comment.findUnique.mockResolvedValue({
        ...mockComment,
        post: mockPost,
      });
      mockPrismaService.comment.update.mockResolvedValue(updatedComment);

      const result = await service.update(10, updateCommentDto, 1);

      expect(result).toEqual(updatedComment);
      expect(mockPrismaService.comment.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: updateCommentDto,
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if comment not found', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(null);

      await expect(service.update(999, updateCommentDto, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user is not the author', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue({
        ...mockComment,
        authorId: 2,
        post: mockPost,
      });

      await expect(service.update(10, updateCommentDto, 1)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrismaService.comment.update).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if the post is locked', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue({
        ...mockComment,
        post: { ...mockPost, isLocked: true },
      });

      await expect(service.update(10, updateCommentDto, 1)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrismaService.comment.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft delete the comment and decrement the post counter', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(mockComment);
      mockPrismaService.comment.update.mockResolvedValue({
        ...mockComment,
        isDeleted: true,
      });
      mockPrismaService.post.update.mockResolvedValue(mockPost);

      await service.remove(10, 1);

      expect(mockPrismaService.comment.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { isDeleted: true },
      });
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { commentCount: { decrement: 1 } },
      });
    });

    it('should throw NotFoundException if comment not found', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(null);

      await expect(service.remove(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the author', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue({
        ...mockComment,
        authorId: 2,
      });

      await expect(service.remove(10, 1)).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.comment.update).not.toHaveBeenCalled();
    });
  });

  describe('getUserComments', () => {
    it('should return paginated comments by a user', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([mockComment]);
      mockPrismaService.comment.count.mockResolvedValue(1);

      const result = await service.getUserComments(1, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result).toHaveProperty('total', 1);
      expect(mockPrismaService.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { authorId: 1, isDeleted: false },
          skip: 0,
          take: 20,
        }),
      );
    });
  });
});
