import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  POPULAR_GEO_COUNTRIES,
  POPULAR_SORTS,
  POPULAR_TIME_WINDOWS,
  type PopularSort,
  type PopularTimeWindow,
} from '../popular.constants';

/**
 * Every parameter is declared on the DTO, unlike `GET /posts`, whose separate
 * `@Query('sortBy')` is rejected by the global `forbidNonWhitelisted` pipe.
 */
export class PopularFeedQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: POPULAR_SORTS, default: 'hot' })
  @IsOptional()
  @IsIn(POPULAR_SORTS)
  sort?: PopularSort = 'hot';

  @ApiPropertyOptional({
    enum: POPULAR_TIME_WINDOWS,
    default: 'day',
    description: 'Rolling window, only used by `sort=top`.',
  })
  @IsOptional()
  @IsIn(POPULAR_TIME_WINDOWS)
  t?: PopularTimeWindow = 'day';

  @ApiPropertyOptional({
    enum: POPULAR_GEO_COUNTRIES,
    description:
      'ISO 3166-1 alpha-2. Limits the feed to posts read from that country. Omit for everywhere.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn(POPULAR_GEO_COUNTRIES)
  geo?: string;
}
