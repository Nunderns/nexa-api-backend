import { IsString, MinLength, IsOptional, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  postId: number;

  @ApiProperty({ example: 'This is a comment' })
  @IsString()
  @MinLength(1)
  content: string;

  @ApiProperty({ example: 5, required: false })
  @IsOptional()
  @IsInt()
  parentId?: number;
}
