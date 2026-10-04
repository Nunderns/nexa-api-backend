import { ApiProperty } from '@nestjs/swagger';

export class CommentResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  postId: number;

  @ApiProperty({ example: 1 })
  authorId: number;

  @ApiProperty({ example: 5, required: false, nullable: true })
  parentId?: number | null;

  @ApiProperty({ example: 'This is a comment' })
  content: string;

  @ApiProperty({ example: 10 })
  score: number;

  @ApiProperty({ example: 15 })
  upvoteCount: number;

  @ApiProperty({ example: 5 })
  downvoteCount: number;

  @ApiProperty({ example: false })
  isDeleted: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  updatedAt: Date;
}
