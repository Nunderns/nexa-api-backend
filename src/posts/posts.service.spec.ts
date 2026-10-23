import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DomainEvent,
  PostCreatedEvent,
  PostUpdatedEvent,
} from '../common/events/domain-events';
import { CommunityRole, PostType } from '@prisma/client';

describe('PostsService', () => {
  let service: PostsService;

  const mockEvents = { emit: jest.fn() };

  const mockPrismaService: any = {
    post: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    community: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    communityMember: {
      findUnique: jest.fn(),
    },
  };
  // Interactive transactions run their callback against the same mock, so
  // assertions on the model methods hold whether or not the call is inside one.
  mockPrismaService.$transaction = jest.fn((work: (tx: any) => unknown) =>
    work(mockPrismaService),
  );

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
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
    mockPrismaService.community.findUnique.mockResolvedValue({
      isPrivate: false,
    });
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

    it('should throw ForbiddenException if user is banned', async () => {
      const createPostDto = {
        communityId: 1,
        title: 'Test Post',
        content: 'Test content',
        postType: PostType.TEXT,
      };

      mockPrismaService.communityMember.findUnique.mockResolvedValue({
        ...mockMembership,
        bannedAt: new Date(),
      });

      await expect(service.create(createPostDto, 1)).rejects.toThrow(
        'You are banned from this community',
      );
      expect(mockPrismaService.post.create).not.toHaveBeenCalled();
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
        where: { isDeleted: false, community: { isPrivate: false } },
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
        where: { isDeleted: false, community: { isPrivate: false } },
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
        where: { isDeleted: false, community: { isPrivate: false } },
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
        where: { isDeleted: false, community: { isPrivate: false } },
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
        expect.objectContaining({
          where: { isDeleted: false, community: { isPrivate: false } },
        }),
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

    it('should include private communities the viewer belongs to', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([]);
      mockPrismaService.post.count.mockResolvedValue(0);

      await service.findAll(1, 20, 'hot', 'all', 7);

      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isDeleted: false,
            community: {
              OR: [
                { isPrivate: false },
                { members: { some: { userId: 7, bannedAt: null } } },
              ],
            },
          },
        }),
      );
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

    it('should reject anonymous viewers of a private community', async () => {
      mockPrismaService.community.findUnique.mockResolvedValue({
        isPrivate: true,
      });

      await expect(service.findByCommunity(1)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrismaService.post.findMany).not.toHaveBeenCalled();
    });

    it('should reject non-members of a private community', async () => {
      mockPrismaService.community.findUnique.mockResolvedValue({
        isPrivate: true,
      });
      mockPrismaService.communityMember.findUnique.mockResolvedValue(null);

      await expect(
        service.findByCommunity(1, 1, 20, 'hot', 'all', 7),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject banned members of a private community', async () => {
      mockPrismaService.community.findUnique.mockResolvedValue({
        isPrivate: true,
      });
      mockPrismaService.communityMember.findUnique.mockResolvedValue({
        ...mockMembership,
        bannedAt: new Date(),
      });

      await expect(
        service.findByCommunity(1, 1, 20, 'hot', 'all', 1),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should list a private community for its members', async () => {
      mockPrismaService.community.findUnique.mockResolvedValue({
        isPrivate: true,
      });
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );
      mockPrismaService.post.findMany.mockResolvedValue([mockPost]);
      mockPrismaService.post.count.mockResolvedValue(1);

      const result = await service.findByCommunity(1, 1, 20, 'hot', 'all', 1);

      expect(result.data).toHaveLength(1);
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

    it('should hide a private community post from non-members', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.community.findUnique.mockResolvedValue({
        isPrivate: true,
      });
      mockPrismaService.communityMember.findUnique.mockResolvedValue(null);

      await expect(service.findOne(1, 7)).rejects.toThrow(ForbiddenException);
    });

    it('should show a private community post to members', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.community.findUnique.mockResolvedValue({
        isPrivate: true,
      });
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );

      await expect(service.findOne(1, 1)).resolves.toEqual(mockPost);
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
      mockPrismaService.post.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.community.update.mockResolvedValue(mockPost.community);

      await service.remove(1, 1);

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.post.updateMany).toHaveBeenCalledWith({
        where: { id: 1, isDeleted: false },
        data: { isDeleted: true },
      });
      expect(mockPrismaService.community.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { postCount: { decrement: 1 } },
      });
    });

    it('should not decrement postCount again when the post is already deleted', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.post.updateMany.mockResolvedValue({ count: 0 });

      await service.remove(1, 1);

      expect(mockPrismaService.community.update).not.toHaveBeenCalled();
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

  describe('domain events', () => {
    it('should publish post.created after the post is stored', async () => {
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );
      mockPrismaService.post.create.mockResolvedValue(mockPost);

      await service.create(
        {
          communityId: 1,
          title: 'Test Post',
          content: 'Test content',
          postType: PostType.TEXT,
        },
        1,
      );

      expect(mockEvents.emit).toHaveBeenCalledWith(
        DomainEvent.PostCreated,
        new PostCreatedEvent(1, 1, 'Test Post', 'Test content'),
      );
    });

    it('should publish post.updated only when title or content change', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.post.update.mockResolvedValue(mockPost);

      await service.update(1, { postType: PostType.LINK }, 1);
      expect(mockEvents.emit).not.toHaveBeenCalled();

      await service.update(1, { content: 'Test content' }, 1);
      expect(mockEvents.emit).toHaveBeenCalledWith(
        DomainEvent.PostUpdated,
        new PostUpdatedEvent(1, 1, 'Test Post', 'Test content'),
      );
    });
  });
});
