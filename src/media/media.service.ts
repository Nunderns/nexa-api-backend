import { unlink } from 'fs/promises';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Media, PostType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { MediaResponseDto } from './dto/media-response.dto';
import { maxBytesFor, UPLOAD_ROUTE } from './media-storage.config';

/** The file kind each post type accepts on `POST /media/upload`. */
const MIME_PREFIX_BY_POST_TYPE: Partial<Record<PostType, string>> = {
  [PostType.IMAGE]: 'image/',
  [PostType.VIDEO]: 'video/',
};

@Injectable()
export class MediaService {
  constructor(private prisma: PrismaService) {}

  async upload(
    uploadMediaDto: UploadMediaDto,
    userId: number,
  ): Promise<MediaResponseDto> {
    const { url, mimeType, sizeBytes, storageKey, postId, commentId } =
      uploadMediaDto;

    if (postId) {
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
      });

      if (!post) {
        throw new NotFoundException('Post not found');
      }

      if (post.authorId !== userId) {
        throw new ForbiddenException(
          'You can only upload media to your own posts',
        );
      }
    }

    if (commentId) {
      const comment = await this.prisma.comment.findUnique({
        where: { id: commentId },
      });

      if (!comment) {
        throw new NotFoundException('Comment not found');
      }

      if (comment.authorId !== userId) {
        throw new ForbiddenException(
          'You can only upload media to your own comments',
        );
      }
    }

    const media = await this.prisma.media.create({
      data: {
        userId,
        postId,
        commentId,
        storageKey: storageKey || this.generateStorageKey(),
        url,
        mimeType,
        sizeBytes: BigInt(sizeBytes),
      },
    });

    return this.toResponse(media);
  }

  /**
   * Records a file multer already wrote to disk and attaches it to an IMAGE or
   * VIDEO post owned by the uploader. Any rejection deletes the file, so a
   * failed upload never leaves an orphan behind.
   */
  async uploadFile(
    file: Express.Multer.File | undefined,
    rawPostId: string | undefined,
    userId: number,
    baseUrl: string,
  ): Promise<MediaResponseDto> {
    if (!file) {
      throw new BadRequestException('A file is required');
    }

    try {
      const postId = Number(rawPostId);
      if (!Number.isInteger(postId) || postId <= 0) {
        throw new BadRequestException('postId must be a positive integer');
      }

      const post = await this.prisma.post.findUnique({
        where: { id: postId },
      });

      if (!post) {
        throw new NotFoundException('Post not found');
      }

      if (post.authorId !== userId) {
        throw new ForbiddenException(
          'You can only upload media to your own posts',
        );
      }

      const expectedPrefix = MIME_PREFIX_BY_POST_TYPE[post.postType];
      if (!expectedPrefix || !file.mimetype.startsWith(expectedPrefix)) {
        throw new BadRequestException(
          `A ${post.postType} post does not accept ${file.mimetype} files`,
        );
      }

      if (file.size > maxBytesFor(file.mimetype)) {
        throw new PayloadTooLargeException('File is too large');
      }

      const media = await this.prisma.media.create({
        data: {
          userId,
          postId,
          storageKey: file.filename,
          url: `${baseUrl}${UPLOAD_ROUTE}/${file.filename}`,
          mimeType: file.mimetype,
          sizeBytes: BigInt(file.size),
        },
      });

      return this.toResponse(media);
    } catch (error) {
      await unlink(file.path).catch(() => undefined);
      throw error;
    }
  }

  async findOne(id: number): Promise<MediaResponseDto> {
    const media = await this.prisma.media.findUnique({
      where: { id },
    });

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    return this.toResponse(media);
  }

  async findByPost(postId: number) {
    const media = await this.prisma.media.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
    });

    return media.map((item) => this.toResponse(item));
  }

  async findByComment(commentId: number) {
    const media = await this.prisma.media.findMany({
      where: { commentId },
      orderBy: { createdAt: 'asc' },
    });

    return media.map((item) => this.toResponse(item));
  }

  async findByUser(userId: number) {
    const media = await this.prisma.media.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return media.map((item) => this.toResponse(item));
  }

  async remove(id: number, userId: number): Promise<void> {
    const media = await this.prisma.media.findUnique({
      where: { id },
    });

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    if (media.userId !== userId) {
      throw new ForbiddenException('You can only delete your own media');
    }

    await this.prisma.media.delete({
      where: { id },
    });
  }

  /** `sizeBytes` is a BigInt column, which `JSON.stringify` cannot encode. */
  private toResponse(media: Media): MediaResponseDto {
    return { ...media, sizeBytes: Number(media.sizeBytes) };
  }

  private generateStorageKey(): string {
    return `media_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
