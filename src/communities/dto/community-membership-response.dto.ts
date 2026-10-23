import { ApiProperty } from '@nestjs/swagger';
import { CommunityRole } from '@prisma/client';

export class CommunityMembershipResponseDto {
  @ApiProperty({
    enum: CommunityRole,
    nullable: true,
    description: 'Null when the caller is not a member or is banned.',
  })
  role: CommunityRole | null;

  @ApiProperty({ example: false })
  isBanned: boolean;
}
