import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommunityRole, PostType } from '@prisma/client';

describe('PostsService', () => {
  let service: PostsService;

  const mockPrismaService = {
    post: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    community: {
      update: jest.fn(),
    },
    communityMember: {
      findUnique: jest.fn(),
    },
  };

  const mockPost = {
    id: 1,
    communityId: 1,
    authorId: 1,
    title: 'Test Post',
    content: 'Test content',
    postType: PostType.TEXT,
    score: 0,
    upvoteCount: 0,
    downvoteCount: 0,
    commentCount: 0,
    isPinned: false,
    isLocked: false,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    community: {
      id: 1,
      name: 'testcommunity',
      displayName: 'Test Community',
      iconUrl: null,
    },
    author: {
      id: 1,
      username: 'testuser',
      displayName: 'Test User',
      avatarUrl: null,
    },
    media: [],
  };

  const mockMembership = {
    communityId: 1,
    userId: 1,
    role: CommunityRole.MEMBER,
    joinedAt: new Date(),
    bannedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new post', async () => {
      const createPostDto = {
        communityId: 1,
        title: 'Test Post',
        content: 'Test content',
        postType: PostType.TEXT,
      };

      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );
      mockPrismaService.post.create.mockResolvedValue(mockPost);
      mockPrismaService.community.update.mockResolvedValue(mockPost.community);

      const result = await service.create(createPostDto, 1);

      expect(result).toEqual(mockPost);
      expect(mockPrismaService.post.create).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is not a member', async () => {
      const createPostDto = {
        communityId: 1,
        title: 'Test Post',
        content: 'Test content',
        postType: PostType.TEXT,
      };

      mockPrismaService.communityMember.findUnique.mockResolvedValue(null);

      await expect(service.create(createPostDto, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated posts sorted by hot', async () => {
      const posts = [mockPost];
      mockPrismaService.post.findMany.mockResolvedValue(posts);
      mockPrismaService.post.count.mockResolvedValue(1);

      const result = await service.findAll(1, 20, 'hot');

      expect(result).toHaveProperty('data');
      expect(result.data).toHaveLength(1);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith({
        where: { isDeleted: false },
        skip: 0,
        take: 20,
        include: expect.any(Object),
        orderBy: { score: 'desc' },
      });
    });

    it('should return paginated posts sorted by new', async () => {
      const posts = [mockPost];
      mockPrismaService.post.findMany.mockResolvedValue(posts);
      mockPrismaService.post.count.mockResolvedValue(1);

      await service.findAll(1, 20, 'new');

      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith({
        where: { isDeleted: false },
        skip: 0,
        take: 20,
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return paginated posts sorted by top', async () => {
      const posts = [mockPost];
      mockPrismaService.post.findMany.mockResolvedValue(posts);
      mockPrismaService.post.count.mockResolvedValue(1);

      await service.findAll(1, 20, 'top');

      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith({
        where: { isDeleted: false },
        skip: 0,
        take: 20,
        include: expect.any(Object),
        orderBy: { upvoteCount: 'desc' },
      });
    });

    it('should put pinned posts first when sorting by featured', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([mockPost]);
      mockPrismaService.post.count.mockResolvedValue(1);

      await service.findAll(1, 20, 'featured');

      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith({
        where: { isDeleted: false },
        skip: 0,
        take: 20,
        include: expect.any(Object),
        orderBy: [
          { isPinned: 'desc' },
          { score: 'desc' },
          { createdAt: 'desc' },
        ],
      });
    });

    it('should not filter by date when time is all', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([mockPost]);
      mockPrismaService.post.count.mockResolvedValue(1);

      await service.findAll(1, 20, 'new', 'all');

      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isDeleted: false } }),
      );
    });

    it('should count only the posts inside the time window', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([]);
      mockPrismaService.post.count.mockResolvedValue(0);

      await service.findAll(1, 20, 'top', 'year');

      const findManyWhere =
        mockPrismaService.post.findMany.mock.calls[0][0].where;
      const countWhere = mockPrismaService.post.count.mock.calls[0][0].where;

      expect(findManyWhere.createdAt).toBeDefined();
      expect(countWhere).toEqual(findManyWhere);
    });
  });

  describe('findByCommunity', () => {
    it('should return paginated posts for a community', async () => {
      const posts = [mockPost];
      mockPrismaService.post.findMany.mockResolvedValue(posts);
      mockPrismaService.post.count.mockResolvedValue(1);

      const result = await service.findByCommunity(1, 1, 20, 'hot');

      expect(result).toHaveProperty('data');
      expect(result.data).toHaveLength(1);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith({
        where: { communityId: 1, isDeleted: false },
        skip: 0,
        take: 20,
        include: expect.any(Object),
        orderBy: { score: 'desc' },
      });
    });

    it('should narrow the community query by the time window too', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([]);
      mockPrismaService.post.count.mockResolvedValue(0);

      await service.findByCommunity(1, 1, 20, 'top', 'month');

      const findManyWhere =
        mockPrismaService.post.findMany.mock.calls[0][0].where;

      expect(findManyWhere.communityId).toBe(1);
      expect(findManyWhere.isDeleted).toBe(false);
      expect(findManyWhere.createdAt).toBeDefined();
      expect(mockPrismaService.post.count).toHaveBeenCalledWith({
        where: findManyWhere,
      });
    });
  });

  describe('findOne', () => {
    it('should return a post by id', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);

      const result = await service.findOne(1);

      expect(result).toEqual(mockPost);
      expect(mockPrismaService.post.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if post not found', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update post if user is author', async () => {
      const updatePostDto = { title: 'Updated Title' };
      const updatedPost = { ...mockPost, title: 'Updated Title' };

      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.post.update.mockResolvedValue(updatedPost);

      const result = await service.update(1, updatePostDto, 1);

      expect(result).toEqual(updatedPost);
    });

    it('should throw ForbiddenException if user is not author', async () => {
      const updatePostDto = { title: 'Updated Title' };
      const otherPost = { ...mockPost, authorId: 2 };

      mockPrismaService.post.findUnique.mockResolvedValue(otherPost);

      await expect(service.update(1, updatePostDto, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if post is locked', async () => {
      const updatePostDto = { title: 'Updated Title' };
      const lockedPost = { ...mockPost, isLocked: true };

      mockPrismaService.post.findUnique.mockResolvedValue(lockedPost);

      await expect(service.update(1, updatePostDto, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if post not found', async () => {
      const updatePostDto = { title: 'Updated Title' };

      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(service.update(999, updatePostDto, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete post if user is author', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.post.update.mockResolvedValue(mockPost);
      mockPrismaService.community.update.mockResolvedValue(mockPost.community);

      await service.remove(1, 1);

      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isDeleted: true },
      });
    });

    it('should throw ForbiddenException if user is not author', async () => {
      const otherPost = { ...mockPost, authorId: 2 };

      mockPrismaService.post.findUnique.mockResolvedValue(otherPost);

      await expect(service.remove(1, 1)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if post not found', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(service.remove(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('pin', () => {
    it('should allow owner to pin post', async () => {
      const ownerMembership = { ...mockMembership, role: CommunityRole.OWNER };
      const postWithCommunity = { ...mockPost, community: mockPost.community };

      mockPrismaService.post.findUnique.mockResolvedValue(postWithCommunity);
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        ownerMembership,
      );
      mockPrismaService.post.update.mockResolvedValue(mockPost);

      const result = await service.pin(1, 1);

      expect(result).toBeDefined();
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isPinned: true },
      });
    });

    it('should allow moderator to pin post', async () => {
      const moderatorMembership = {
        ...mockMembership,
        role: CommunityRole.MODERATOR,
      };
      const postWithCommunity = { ...mockPost, community: mockPost.community };

      mockPrismaService.post.findUnique.mockResolvedValue(postWithCommunity);
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        moderatorMembership,
      );
      mockPrismaService.post.update.mockResolvedValue(mockPost);

      const result = await service.pin(1, 1);

      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException if not owner or moderator', async () => {
      const postWithCommunity = { ...mockPost, community: mockPost.community };

      mockPrismaService.post.findUnique.mockResolvedValue(postWithCommunity);
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );

      await expect(service.pin(1, 1)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if post not found', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(service.pin(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('unpin', () => {
    it('should allow owner to unpin post', async () => {
      const ownerMembership = { ...mockMembership, role: CommunityRole.OWNER };
      const postWithCommunity = { ...mockPost, community: mockPost.community };

      mockPrismaService.post.findUnique.mockResolvedValue(postWithCommunity);
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        ownerMembership,
      );
      mockPrismaService.post.update.mockResolvedValue(mockPost);

      const result = await service.unpin(1, 1);

      expect(result).toBeDefined();
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isPinned: false },
      });
    });

    it('should throw ForbiddenException if not owner or moderator', async () => {
      const postWithCommunity = { ...mockPost, community: mockPost.community };

      mockPrismaService.post.findUnique.mockResolvedValue(postWithCommunity);
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );

      await expect(service.unpin(1, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('lock', () => {
    it('should allow owner to lock post', async () => {
      const ownerMembership = { ...mockMembership, role: CommunityRole.OWNER };
      const postWithCommunity = { ...mockPost, community: mockPost.community };

      mockPrismaService.post.findUnique.mockResolvedValue(postWithCommunity);
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        ownerMembership,
      );
      mockPrismaService.post.update.mockResolvedValue(mockPost);

      const result = await service.lock(1, 1);

      expect(result).toBeDefined();
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isLocked: true },
      });
    });

    it('should throw ForbiddenException if not owner or moderator', async () => {
      const postWithCommunity = { ...mockPost, community: mockPost.community };

      mockPrismaService.post.findUnique.mockResolvedValue(postWithCommunity);
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );

      await expect(service.lock(1, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('unlock', () => {
    it('should allow owner to unlock post', async () => {
      const ownerMembership = { ...mockMembership, role: CommunityRole.OWNER };
      const postWithCommunity = { ...mockPost, community: mockPost.community };

      mockPrismaService.post.findUnique.mockResolvedValue(postWithCommunity);
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        ownerMembership,
      );
      mockPrismaService.post.update.mockResolvedValue(mockPost);

      const result = await service.unlock(1, 1);

      expect(result).toBeDefined();
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isLocked: false },
      });
    });

    it('should throw ForbiddenException if not owner or moderator', async () => {
      const postWithCommunity = { ...mockPost, community: mockPost.community };

      mockPrismaService.post.findUnique.mockResolvedValue(postWithCommunity);
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );

      await expect(service.unlock(1, 1)).rejects.toThrow(ForbiddenException);
    });
  });
});
