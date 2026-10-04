import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CommunityRole } from '@prisma/client';

export class JoinCommunityDto {
  @ApiProperty({ enum: CommunityRole, example: CommunityRole.MEMBER })
  @IsEnum(CommunityRole)
  role?: CommunityRole;
}
