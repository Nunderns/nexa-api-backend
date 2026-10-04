import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsEnum,
  IsInt,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PostType } from '@prisma/client';

export class CreatePostDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  communityId: number;

  @ApiProperty({ example: 'My first post' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title: string;

  @ApiProperty({ example: 'This is the content of my post', required: false })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ enum: PostType, example: PostType.TEXT })
  @IsEnum(PostType)
  postType: PostType;
}
