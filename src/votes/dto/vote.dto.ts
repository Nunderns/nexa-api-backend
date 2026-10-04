import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VoteDto {
  @ApiProperty({
    example: 1,
    description: '1 for upvote, -1 for downvote, 0 to remove vote',
  })
  @IsInt()
  @Min(-1)
  @Max(1)
  vote: number;
}
