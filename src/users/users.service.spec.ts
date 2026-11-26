import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { mockPrismaTransactions } from '../common/testing/prisma-transaction';
import { UPLOAD_DIR } from '../media/media-storage.config';

jest.mock('bcrypt');
jest.mock('fs/promises', () => ({ unlink: jest.fn() }));

describe('UsersService', () => {
  let service: UsersService;

  const mockPrismaService = mockPrismaTransactions({
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    post: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    comment: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      updateMany: jest.fn(),
    },
    postVote: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    community: { update: jest.fn() },
    communityMember: { findMany: jest.fn(), deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    notificationPreference: { deleteMany: jest.fn() },
    message: { deleteMany: jest.fn() },
    refreshToken: { deleteMany: jest.fn() },
    passwordResetToken: { deleteMany: jest.fn() },
    media: { findMany: jest.fn(), deleteMany: jest.fn() },
  });

  const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    displayName: 'Test User',
    bio: null,
    avatarUrl: null,
    karma: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      const users = [mockUser];
      mockPrismaService.user.findMany.mockResolvedValue(users);
      mockPrismaService.user.count.mockResolvedValue(1);

      const result = await service.findAll(1, 20);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 20);
      expect(result.data).toHaveLength(1);
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 20,
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should never select email', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);
      mockPrismaService.user.count.mockResolvedValue(0);

      await service.findAll(1, 20);

      const { select } = mockPrismaService.user.findMany.mock.calls[0][0];
      expect(select).not.toHaveProperty('email');
      expect(select).toHaveProperty('username', true);
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOne(1);

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: expect.any(Object),
      });
    });

    it.each([
      ['an anonymous viewer', undefined, false],
      ['another user', 2, false],
      ['the user themselves', 1, true],
    ])('should select email for %s: %p', async (_label, viewerId, expected) => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await service.findOne(1, viewerId);

      const { select } = mockPrismaService.user.findUnique.mock.calls[0][0];
      expect(select.email).toBe(expected);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByUsername', () => {
    it('should return a user by username', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findByUsername('testuser', 1);

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { username: 'testuser' },
        select: expect.any(Object),
      });
    });

    it.each([
      ['an anonymous viewer', undefined],
      ['another user', 2],
    ])('should omit email for %s', async (_label, viewerId) => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findByUsername('testuser', viewerId);

      expect(result).not.toHaveProperty('email');
      expect(result).toHaveProperty('username', 'testuser');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findByUsername('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update user if current user matches', async () => {
      const updateUserDto = { displayName: 'Updated Name' };
      const updatedUser = { ...mockUser, displayName: 'Updated Name' };

      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.update(1, updateUserDto, 1);

      expect(result).toEqual(updatedUser);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: updateUserDto,
        select: expect.any(Object),
      });
    });

    it('should throw ForbiddenException if user tries to update another user', async () => {
      const updateUserDto = { displayName: 'Updated Name' };

      await expect(service.update(1, updateUserDto, 2)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('remove', () => {
    const mockCompare = bcrypt.compare as jest.Mock;
    const mockUnlink = unlink as jest.Mock;

    const arrangeLiveAccount = () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        passwordHash: 'hash',
      });
      mockCompare.mockResolvedValue(true);
      mockPrismaService.user.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.post.groupBy.mockResolvedValue([{ communityId: 10 }]);
      mockPrismaService.post.updateMany.mockResolvedValue({ count: 2 });
      mockPrismaService.comment.groupBy.mockResolvedValue([{ postId: 20 }]);
      mockPrismaService.comment.updateMany.mockResolvedValue({ count: 3 });
      mockPrismaService.communityMember.findMany.mockResolvedValue([
        { communityId: 30 },
      ]);
      mockPrismaService.communityMember.deleteMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.media.findMany.mockResolvedValue([
        { storageKey: 'a.png' },
        { storageKey: '../../etc/passwd' },
      ]);
      mockUnlink.mockResolvedValue(undefined);
    };

    it('should throw ForbiddenException if user tries to delete another user', async () => {
      await expect(service.remove(1, 2, 'pw')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if the user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.remove(1, 1, 'pw')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw UnauthorizedException on a wrong password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        passwordHash: 'hash',
      });
      mockCompare.mockResolvedValue(false);

      await expect(service.remove(1, 1, 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockCompare).toHaveBeenCalledWith('wrong', 'hash');
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should anonymize the profile and wipe credentials', async () => {
      arrangeLiveAccount();

      await service.remove(1, 1, 'pw');

      expect(mockPrismaService.user.updateMany).toHaveBeenCalledWith({
        where: { id: 1, isActive: true },
        data: expect.objectContaining({
          username: 'deleted_1',
          email: 'deleted_1@deleted.invalid',
          passwordHash: '!',
          displayName: '[deleted]',
          bio: null,
          avatarUrl: null,
          isActive: false,
          isEmailVerified: false,
          emailVerificationToken: null,
        }),
      });
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(
        mockPrismaService.passwordResetToken.deleteMany,
      ).toHaveBeenCalledWith({ where: { userId: 1 } });
    });

    it('should erase posts and comments and keep the counters in sync', async () => {
      arrangeLiveAccount();

      await service.remove(1, 1, 'pw');

      expect(mockPrismaService.post.updateMany).toHaveBeenCalledWith({
        where: { authorId: 1, communityId: 10, isDeleted: false },
        data: { isDeleted: true },
      });
      expect(mockPrismaService.community.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { postCount: { decrement: 2 } },
      });
      expect(mockPrismaService.post.updateMany).toHaveBeenCalledWith({
        where: { authorId: 1 },
        data: { title: '[deleted]', content: null },
      });
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: { commentCount: { decrement: 3 } },
      });
      expect(mockPrismaService.comment.updateMany).toHaveBeenCalledWith({
        where: { authorId: 1 },
        data: { content: '[deleted]' },
      });
    });

    it('should leave communities, decrementing only unbanned memberships', async () => {
      arrangeLiveAccount();

      await service.remove(1, 1, 'pw');

      expect(mockPrismaService.communityMember.deleteMany).toHaveBeenCalledWith(
        { where: { communityId: 30, userId: 1, bannedAt: null } },
      );
      expect(mockPrismaService.community.update).toHaveBeenCalledWith({
        where: { id: 30 },
        data: { memberCount: { decrement: 1 } },
      });
      expect(mockPrismaService.communityMember.deleteMany).toHaveBeenCalledWith(
        { where: { userId: 1 } },
      );
    });

    it('should delete messages, notifications in both directions and media', async () => {
      arrangeLiveAccount();

      await service.remove(1, 1, 'pw');

      expect(mockPrismaService.message.deleteMany).toHaveBeenCalledWith({
        where: { senderId: 1 },
      });
      expect(mockPrismaService.notification.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ recipientId: 1 }, { actorId: 1 }] },
      });
      expect(
        mockPrismaService.notificationPreference.deleteMany,
      ).toHaveBeenCalledWith({ where: { userId: 1 } });
      expect(mockPrismaService.media.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
    });

    it('should unlink media files inside the upload directory only', async () => {
      arrangeLiveAccount();

      await service.remove(1, 1, 'pw');

      expect(mockUnlink).toHaveBeenCalledWith(join(UPLOAD_DIR, 'a.png'));
      expect(mockUnlink).toHaveBeenCalledWith(join(UPLOAD_DIR, 'passwd'));
    });

    it('should ignore media files that are already gone', async () => {
      arrangeLiveAccount();
      mockUnlink.mockRejectedValue(new Error('ENOENT'));

      await expect(service.remove(1, 1, 'pw')).resolves.toBeUndefined();
    });

    it('should do nothing more if the account was already deleted concurrently', async () => {
      arrangeLiveAccount();
      mockPrismaService.user.updateMany.mockResolvedValue({ count: 0 });

      await service.remove(1, 1, 'pw');

      expect(mockPrismaService.post.groupBy).not.toHaveBeenCalled();
      expect(mockPrismaService.media.deleteMany).not.toHaveBeenCalled();
      expect(mockUnlink).not.toHaveBeenCalled();
    });
  });

  describe('exportData', () => {
    it('should return the user data with media sizes as numbers', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        posts: [],
        media: [{ id: 1, sizeBytes: BigInt(2048) }],
      });

      const result = await service.exportData(1);

      expect(result.exportedAt).toBeInstanceOf(Date);
      expect(result.username).toBe('testuser');
      expect(result.media).toEqual([{ id: 1, sizeBytes: 2048 }]);
      expect(() => JSON.stringify(result)).not.toThrow();
      const [query] = mockPrismaService.user.findUnique.mock.calls[0] as [
        { where: unknown; select: object },
      ];
      expect(query.where).toEqual({ id: 1 });
      expect(query.select).not.toHaveProperty('passwordHash');
    });

    it('should throw NotFoundException if the user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.exportData(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserPosts', () => {
    it('should return paginated user posts', async () => {
      const posts = [
        {
          id: 1,
          title: 'Test Post',
          content: 'Content',
          community: { id: 1, name: 'test', displayName: 'Test' },
          author: {
            id: 1,
            username: 'testuser',
            displayName: 'Test User',
            avatarUrl: null,
          },
        },
      ];

      mockPrismaService.post.findMany.mockResolvedValue(posts);
      mockPrismaService.post.count.mockResolvedValue(1);

      const result = await service.getUserPosts(1, 1, 20);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result.data).toHaveLength(1);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith({
        where: {
          authorId: 1,
          isDeleted: false,
          community: { isPrivate: false },
        },
        skip: 0,
        take: 20,
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getUserComments', () => {
    it('should return paginated user comments', async () => {
      const comments = [
        {
          id: 1,
          content: 'Test comment',
          post: { id: 1, title: 'Test Post' },
          author: {
            id: 1,
            username: 'testuser',
            displayName: 'Test User',
            avatarUrl: null,
          },
        },
      ];

      mockPrismaService.comment.findMany.mockResolvedValue(comments);
      mockPrismaService.comment.count.mockResolvedValue(1);

      const result = await service.getUserComments(1, 1, 20);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result.data).toHaveLength(1);
      expect(mockPrismaService.comment.findMany).toHaveBeenCalledWith({
        where: { authorId: 1, isDeleted: false },
        skip: 0,
        take: 20,
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getUserUpvoted', () => {
    it('should return posts the user upvoted, newest vote first', async () => {
      const posts = [{ id: 1, title: 'Test Post' }];
      mockPrismaService.postVote.findMany.mockResolvedValue(
        posts.map((post) => ({ userId: 1, postId: post.id, vote: 1, post })),
      );
      mockPrismaService.postVote.count.mockResolvedValue(1);

      const result = await service.getUserUpvoted(1, 1, 20);

      expect(result).toHaveProperty('data');
      expect(result.data).toEqual(posts);
      expect(result).toHaveProperty('total', 1);
      expect(mockPrismaService.postVote.findMany).toHaveBeenCalledWith({
        where: { userId: 1, vote: 1, post: { isDeleted: false } },
        skip: 0,
        take: 20,
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getUserDownvoted', () => {
    it('should return posts the user downvoted, newest vote first', async () => {
      const posts = [{ id: 2, title: 'Other Post' }];
      mockPrismaService.postVote.findMany.mockResolvedValue(
        posts.map((post) => ({ userId: 1, postId: post.id, vote: -1, post })),
      );
      mockPrismaService.postVote.count.mockResolvedValue(1);

      const result = await service.getUserDownvoted(1, 1, 20);

      expect(result).toHaveProperty('data');
      expect(result.data).toEqual(posts);
      expect(result).toHaveProperty('total', 1);
      expect(mockPrismaService.postVote.findMany).toHaveBeenCalledWith({
        where: { userId: 1, vote: -1, post: { isDeleted: false } },
        skip: 0,
        take: 20,
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
