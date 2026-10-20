import { ApiProperty } from '@nestjs/swagger';

export class CommunityStatsResponseDto {
  @ApiProperty({ example: '2026-10-19T00:00:00.000Z' })
  weekStart: Date;

  @ApiProperty({
    example: 128,
    description: "Distinct viewers of the community's posts this week.",
  })
  visitors: number;

  @ApiProperty({
    example: 42,
    description: 'Posts plus comments created this week.',
  })
  contributions: number;
}
