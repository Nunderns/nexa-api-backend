import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsBoolean,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCommunityDto {
  @ApiProperty({ example: 'programming' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Name can only contain letters, numbers, hyphens and underscores',
  })
  name: string;

  @ApiProperty({ example: 'Programming Community' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName: string;

  @ApiProperty({ example: 'A community for programmers', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'https://example.com/icon.jpg', required: false })
  @IsOptional()
  @IsString()
  iconUrl?: string;

  @ApiProperty({ example: 'https://example.com/banner.jpg', required: false })
  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isNsfw?: boolean;
}
