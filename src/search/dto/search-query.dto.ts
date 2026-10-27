import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export const SEARCH_TYPES = ['posts', 'communities', 'users'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export class SearchQueryDto extends PaginationDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q: string;

  @ApiPropertyOptional({ enum: SEARCH_TYPES, default: 'posts' })
  @IsOptional()
  @IsIn(SEARCH_TYPES)
  type?: SearchType = 'posts';
}
