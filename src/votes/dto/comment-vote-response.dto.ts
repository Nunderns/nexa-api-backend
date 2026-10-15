import { ApiProperty } from '@nestjs/swagger';

export class CommentVoteResponseDto {
  @ApiProperty({ example: 1 })
  userId: number;

  @ApiProperty({ example: 1 })
  commentId: number;

  @ApiProperty({ example: 1 })
  vote: number;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  updatedAt: Date;
}
