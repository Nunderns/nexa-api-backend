import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'johndoe' })
  username: string;

  @ApiProperty({ example: 'john@example.com' })
  email: string;

  @ApiProperty({ example: 'John Doe' })
  displayName: string;

  @ApiProperty({
    example: 'Software developer',
    required: false,
    nullable: true,
  })
  bio?: string | null;

  @ApiProperty({
    example: 'https://example.com/avatar.jpg',
    required: false,
    nullable: true,
  })
  avatarUrl?: string | null;

  @ApiProperty({ example: 100 })
  karma: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  updatedAt: Date;
}
