import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { MediaResponseDto } from './dto/media-response.dto';

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

    return media;
  }

  async findOne(id: number): Promise<MediaResponseDto> {
    const media = await this.prisma.media.findUnique({
      where: { id },
    });

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    return media;
  }

  async findByPost(postId: number) {
    const media = await this.prisma.media.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
    });

    return media;
  }

  async findByComment(commentId: number) {
    const media = await this.prisma.media.findMany({
      where: { commentId },
      orderBy: { createdAt: 'asc' },
    });

    return media;
  }

  async findByUser(userId: number) {
    const media = await this.prisma.media.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return media;
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

  private generateStorageKey(): string {
    return `media_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
