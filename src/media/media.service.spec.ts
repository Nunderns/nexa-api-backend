import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { unlink } from 'fs/promises';
import { PostType } from '@prisma/client';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_IMAGE_BYTES } from './media-storage.config';

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe('MediaService', () => {
  let service: MediaService;

  const mockPrismaService = {
    post: {
      findUnique: jest.fn(),
    },
    comment: {
      findUnique: jest.fn(),
    },
    media: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockMedia = {
    id: 1,
    userId: 1,
    postId: 1,
    commentId: null,
    storageKey: 'media_1700000000_abc123',
    url: 'https://example.com/image.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: BigInt(1024),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  /** What the service returns: the BigInt column as a plain number. */
  const mediaResponse = { ...mockMedia, sizeBytes: 1024 };

  const baseDto = {
    url: 'https://example.com/image.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upload', () => {
    it('should upload media without attachment using a generated storage key', async () => {
      mockPrismaService.media.create.mockResolvedValue(mockMedia);

      const result = await service.upload(baseDto, 1);

      expect(result).toEqual(mediaResponse);
      expect(mockPrismaService.post.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.comment.findUnique).not.toHaveBeenCalled();

      const { data } = mockPrismaService.media.create.mock.calls[0][0];

      expect(data.userId).toBe(1);
      expect(data.postId).toBeUndefined();
      expect(data.commentId).toBeUndefined();
      expect(data.storageKey).toMatch(/^media_\d+_[a-z0-9]+$/);
    });

    it('should keep the storage key provided by the client', async () => {
      mockPrismaService.media.create.mockResolvedValue(mockMedia);

      await service.upload({ ...baseDto, storageKey: 'my-key' }, 1);

      expect(mockPrismaService.media.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ storageKey: 'my-key' }),
      });
    });

    it('should store sizeBytes as a BigInt', async () => {
      mockPrismaService.media.create.mockResolvedValue(mockMedia);

      await service.upload(baseDto, 1);

      const { data } = mockPrismaService.media.create.mock.calls[0][0];

      expect(data.sizeBytes).toBe(BigInt(1024));
      expect(typeof data.sizeBytes).toBe('bigint');
    });

    it('should attach media to a post owned by the user', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 1,
        authorId: 1,
      });
      mockPrismaService.media.create.mockResolvedValue(mockMedia);

      await service.upload({ ...baseDto, postId: 1 }, 1);

      expect(mockPrismaService.post.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(mockPrismaService.media.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ postId: 1 }),
      });
    });

    it('should throw NotFoundException if the post not found', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(
        service.upload({ ...baseDto, postId: 9 }, 1),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.media.create).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException attaching to another user post', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 1,
        authorId: 2,
      });

      await expect(
        service.upload({ ...baseDto, postId: 1 }, 1),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.media.create).not.toHaveBeenCalled();
    });

    it('should attach media to a comment owned by the user', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue({
        id: 10,
        authorId: 1,
      });
      mockPrismaService.media.create.mockResolvedValue(mockMedia);

      await service.upload({ ...baseDto, commentId: 10 }, 1);

      expect(mockPrismaService.media.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ commentId: 10 }),
      });
    });

    it('should throw NotFoundException if the comment not found', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(null);

      await expect(
        service.upload({ ...baseDto, commentId: 999 }, 1),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.media.create).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException attaching to another user comment', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue({
        id: 10,
        authorId: 2,
      });

      await expect(
        service.upload({ ...baseDto, commentId: 10 }, 1),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('uploadFile', () => {
    const file = {
      fieldname: 'file',
      originalname: 'photo.png',
      mimetype: 'image/png',
      size: 2048,
      filename: 'abc.png',
      path: '/tmp/uploads/abc.png',
    } as Express.Multer.File;

    const imagePost = { id: 1, authorId: 1, postType: PostType.IMAGE };

    it('should record the file against an own IMAGE post', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(imagePost);
      mockPrismaService.media.create.mockResolvedValue(mockMedia);

      const result = await service.uploadFile(
        file,
        '1',
        1,
        'http://localhost:3000',
      );

      expect(result).toEqual(mediaResponse);
      expect(mockPrismaService.media.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          postId: 1,
          storageKey: 'abc.png',
          url: 'http://localhost:3000/uploads/abc.png',
          mimeType: 'image/png',
          sizeBytes: BigInt(2048),
        },
      });
      expect(unlink).not.toHaveBeenCalled();
    });

    it('should accept a video on a VIDEO post', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...imagePost,
        postType: PostType.VIDEO,
      });
      mockPrismaService.media.create.mockResolvedValue(mockMedia);

      await service.uploadFile(
        { ...file, mimetype: 'video/mp4' },
        '1',
        1,
        'http://x',
      );

      expect(mockPrismaService.media.create).toHaveBeenCalled();
    });

    it('should reject a missing file', async () => {
      await expect(
        service.uploadFile(undefined, '1', 1, 'http://x'),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([undefined, 'abc', '0', '-1', '1.5'])(
      'should reject postId %p and delete the file',
      async (postId) => {
        await expect(
          service.uploadFile(file, postId, 1, 'http://x'),
        ).rejects.toThrow(BadRequestException);
        expect(unlink).toHaveBeenCalledWith(file.path);
      },
    );

    it('should reject an unknown post and delete the file', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(
        service.uploadFile(file, '1', 1, 'http://x'),
      ).rejects.toThrow(NotFoundException);
      expect(unlink).toHaveBeenCalledWith(file.path);
    });

    it('should reject another user post and delete the file', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...imagePost,
        authorId: 2,
      });

      await expect(
        service.uploadFile(file, '1', 1, 'http://x'),
      ).rejects.toThrow(ForbiddenException);
      expect(unlink).toHaveBeenCalledWith(file.path);
    });

    it.each([
      [PostType.IMAGE, 'video/mp4'],
      [PostType.VIDEO, 'image/png'],
      [PostType.TEXT, 'image/png'],
      [PostType.LINK, 'image/png'],
    ])('should reject a %s post receiving %s', async (postType, mimetype) => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...imagePost,
        postType,
      });

      await expect(
        service.uploadFile({ ...file, mimetype }, '1', 1, 'http://x'),
      ).rejects.toThrow(BadRequestException);
      expect(unlink).toHaveBeenCalledWith(file.path);
      expect(mockPrismaService.media.create).not.toHaveBeenCalled();
    });

    it('should reject an image above the image size limit', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(imagePost);

      await expect(
        service.uploadFile(
          { ...file, size: MAX_IMAGE_BYTES + 1 },
          '1',
          1,
          'http://x',
        ),
      ).rejects.toThrow(PayloadTooLargeException);
      expect(unlink).toHaveBeenCalledWith(file.path);
    });
  });

  describe('findOne', () => {
    it('should return media by id', async () => {
      mockPrismaService.media.findUnique.mockResolvedValue(mockMedia);

      const result = await service.findOne(1);

      expect(result).toEqual(mediaResponse);
      expect(mockPrismaService.media.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw NotFoundException if media not found', async () => {
      mockPrismaService.media.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByPost', () => {
    it('should return media of a post ordered by creation date', async () => {
      mockPrismaService.media.findMany.mockResolvedValue([mockMedia]);

      const result = await service.findByPost(1);

      expect(result).toEqual([mediaResponse]);
      expect(mockPrismaService.media.findMany).toHaveBeenCalledWith({
        where: { postId: 1 },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('findByComment', () => {
    it('should return media of a comment ordered by creation date', async () => {
      mockPrismaService.media.findMany.mockResolvedValue([mockMedia]);

      const result = await service.findByComment(10);

      expect(result).toEqual([mediaResponse]);
      expect(mockPrismaService.media.findMany).toHaveBeenCalledWith({
        where: { commentId: 10 },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('findByUser', () => {
    it('should return media of a user ordered by newest first', async () => {
      mockPrismaService.media.findMany.mockResolvedValue([mockMedia]);

      const result = await service.findByUser(1);

      expect(result).toEqual([mediaResponse]);
      expect(mockPrismaService.media.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('remove', () => {
    it('should delete media owned by the user', async () => {
      mockPrismaService.media.findUnique.mockResolvedValue(mockMedia);
      mockPrismaService.media.delete.mockResolvedValue(mockMedia);

      await service.remove(1, 1);

      expect(mockPrismaService.media.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw NotFoundException if media not found', async () => {
      mockPrismaService.media.findUnique.mockResolvedValue(null);

      await expect(service.remove(999, 1)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.media.delete).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if media belongs to another user', async () => {
      mockPrismaService.media.findUnique.mockResolvedValue({
        ...mockMedia,
        userId: 2,
      });

      await expect(service.remove(1, 1)).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.media.delete).not.toHaveBeenCalled();
    });
  });
});
