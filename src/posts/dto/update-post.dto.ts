import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PostType } from '@prisma/client';

export class UpdatePostDto {
  @ApiProperty({ example: 'Updated title', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @ApiProperty({ example: 'Updated content', required: false })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ enum: PostType, required: false })
  @IsOptional()
  @IsEnum(PostType)
  postType?: PostType;
}
