import { ApiProperty } from '@nestjs/swagger';

export class PostResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  communityId: number;

  @ApiProperty({ example: 1 })
  authorId: number;

  @ApiProperty({ example: 'My first post' })
  title: string;

  @ApiProperty({
    example: 'This is the content',
    required: false,
    nullable: true,
  })
  content?: string | null;

  @ApiProperty({ example: 'TEXT' })
  postType: string;

  @ApiProperty({ example: 100 })
  score: number;

  @ApiProperty({ example: 150 })
  upvoteCount: number;

  @ApiProperty({ example: 50 })
  downvoteCount: number;

  @ApiProperty({ example: 10 })
  commentCount: number;

  @ApiProperty({ example: false })
  isPinned: boolean;

  @ApiProperty({ example: false })
  isLocked: boolean;

  @ApiProperty({ example: false })
  isDeleted: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  updatedAt: Date;
}
