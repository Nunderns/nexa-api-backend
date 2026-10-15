import { IsString, IsInt, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadMediaDto {
  @ApiProperty({ example: 'https://example.com/image.jpg' })
  @IsString()
  url: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  mimeType: string;

  @ApiProperty({ example: 1024000 })
  @IsInt()
  sizeBytes: number;

  @ApiProperty({ example: 'storage-key-123', required: false })
  @IsOptional()
  @IsString()
  storageKey?: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  postId?: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  commentId?: number;
}
