import { ApiProperty } from '@nestjs/swagger';

export class MediaResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  userId: number;

  @ApiProperty({ example: 1, required: false, nullable: true })
  postId?: number | null;

  @ApiProperty({ example: 1, required: false, nullable: true })
  commentId?: number | null;

  @ApiProperty({ example: 'storage-key-123' })
  storageKey: string;

  @ApiProperty({ example: 'https://example.com/image.jpg' })
  url: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;

  @ApiProperty({ example: 1024000 })
  sizeBytes: bigint;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  createdAt: Date;
}
