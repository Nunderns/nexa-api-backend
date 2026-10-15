import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCommunityDto {
  @ApiProperty({ example: 'Programming Community', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName?: string;

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
