import { IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCommentDto {
  @ApiProperty({ example: 'Updated comment content', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;
}
