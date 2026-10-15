import { ApiProperty } from '@nestjs/swagger';

export class CommunityResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'programming' })
  name: string;

  @ApiProperty({ example: 'Programming Community' })
  displayName: string;

  @ApiProperty({
    example: 'A community for programmers',
    required: false,
    nullable: true,
  })
  description?: string | null;

  @ApiProperty({
    example: 'https://example.com/icon.jpg',
    required: false,
    nullable: true,
  })
  iconUrl?: string | null;

  @ApiProperty({
    example: 'https://example.com/banner.jpg',
    required: false,
    nullable: true,
  })
  bannerUrl?: string | null;

  @ApiProperty({ example: false })
  isPrivate: boolean;

  @ApiProperty({ example: false })
  isNsfw: boolean;

  @ApiProperty({ example: 1000 })
  memberCount: number;

  @ApiProperty({ example: 500 })
  postCount: number;

  @ApiProperty({ example: 1 })
  createdBy: number;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  updatedAt: Date;
}
