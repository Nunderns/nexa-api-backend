import { ApiProperty } from '@nestjs/swagger';

/**
 * One bar of the hourly views chart.
 *
 * The series is dense: it always contains one entry per hour in the window,
 * including the zero ones. A sparse series would force the client to guess
 * which hours are missing and render a chart with gaps in the wrong places.
 */
export class InsightsHourlyViewDto {
  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  bucketStart: Date;

  /** Whole hours since the post was published. `1` is the first full hour. */
  @ApiProperty({ example: 1 })
  hour: number;

  @ApiProperty({ example: 35 })
  views: number;
}

export class InsightsCountryViewDto {
  /** ISO 3166-1 alpha-2, or `XX` when unknown. */
  @ApiProperty({ example: 'US' })
  countryCode: string;

  @ApiProperty({ example: 1020 })
  views: number;

  /** Share of all views, 0-100 with one decimal place. */
  @ApiProperty({ example: 32.8 })
  percentage: number;
}

export class InsightsCountriesDto {
  /** Highest-traffic countries, capped at `INSIGHTS_TOP_COUNTRIES`. */
  @ApiProperty({ type: [InsightsCountryViewDto] })
  top: InsightsCountryViewDto[];

  /** Everything outside `top`, so the listed shares do not look incomplete. */
  @ApiProperty({ type: InsightsCountryViewDto })
  other: InsightsCountryViewDto;
}

export class InsightsReachDto {
  @ApiProperty({ example: 3110 })
  views: number;

  @ApiProperty({ example: 16 })
  viewsLast24h: number;

  @ApiProperty({ example: 48 })
  hoursTracked: number;
}

export class InsightsEngagementDto {
  @ApiProperty({ example: 30 })
  upvotes: number;

  @ApiProperty({ example: 0 })
  downvotes: number;

  /**
   * Upvotes as a percentage of all votes, 0-100.
   *
   * Null rather than 0 when nobody has voted: "0% upvote ratio" and "nobody has
   * voted" are different facts and collapsing them makes an unreviewed post
   * look like one that was voted down unanimously.
   */
  @ApiProperty({ example: 100, nullable: true })
  upvoteRatio: number | null;

  @ApiProperty({ example: 0 })
  comments: number;

  @ApiProperty({ example: 10 })
  shares: number;

  @ApiProperty({ example: 0 })
  reposts: number;

  @ApiProperty({ example: 0 })
  awards: number;
}

export class PostInsightsResponseDto {
  @ApiProperty({ example: 1 })
  postId: number;

  @ApiProperty({ example: 'Bonus chapters in Volume 10' })
  title: string;

  @ApiProperty({ example: 'r/inbinadoukutsunos' })
  communityName: string;

  @ApiProperty({ example: 1 })
  authorId: number;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  publishedAt: Date;

  @ApiProperty({ type: InsightsReachDto })
  reach: InsightsReachDto;

  @ApiProperty({ type: [InsightsHourlyViewDto] })
  hourlyViews: InsightsHourlyViewDto[];

  @ApiProperty({ type: InsightsCountriesDto })
  countries: InsightsCountriesDto;

  @ApiProperty({ type: InsightsEngagementDto })
  engagement: InsightsEngagementDto;
}
