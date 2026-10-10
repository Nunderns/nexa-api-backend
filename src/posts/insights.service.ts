import { createHash, createHmac } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommunityRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  INSIGHTS_CHART_HOURS,
  INSIGHTS_TOP_COUNTRIES,
  UNKNOWN_COUNTRY,
  VIEW_DEDUPE_WINDOW_MS,
} from './insights.constants';
import type {
  InsightsCountryViewDto,
  InsightsHourlyViewDto,
  PostInsightsResponseDto,
} from './dto/post-insights-response.dto';

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class InsightsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Records a visit to a post.
   *
   * Best-effort by design: a failure here must never turn `GET /posts/:id`
   * into an error, because losing one analytics row is far cheaper than
   * refusing to show the post. The caller is expected to `.catch()` this.
   *
   * Returns whether the view was counted. A `false` means the same visitor came
   * back inside the dedupe window, or the post is gone/soft-deleted.
   */
  async recordView(
    postId: number,
    viewer: { userId?: number; ip?: string; countryCode?: string },
  ): Promise<boolean> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, isDeleted: true },
    });

    if (!post || post.isDeleted) {
      return false;
    }

    const viewerKey = this.buildViewerKey(viewer);
    const cutoff = new Date(Date.now() - VIEW_DEDUPE_WINDOW_MS);

    const recent = await this.prisma.postView.findFirst({
      where: { postId, viewerKey, viewedAt: { gte: cutoff } },
      select: { id: true },
    });

    if (recent) {
      return false;
    }

    const countryCode = this.normalizeCountryCode(viewer.countryCode);
    const bucketStart = this.truncateToHour(new Date());

    // The three writes have to agree with each other: a raw row without a
    // bucket makes the chart under-report, a bucket without a raw row makes the
    // event unauditable, and a bucket without the counter makes "views" and the
    // chart disagree. A partial write is worse than no write, so they share one
    // transaction.
    await this.prisma.$transaction(async (tx) => {
      await tx.postView.create({
        data: { postId, viewerKey, countryCode, viewedAt: new Date() },
      });

      await tx.postViewStat.upsert({
        where: {
          postId_bucketStart_countryCode: { postId, bucketStart, countryCode },
        },
        create: { postId, bucketStart, countryCode, views: 1 },
        update: { views: { increment: 1 } },
      });

      await tx.post.update({
        where: { id: postId },
        data: { viewCount: { increment: 1 } },
      });
    });

    return true;
  }

  /**
   * Reach and engagement for a post, visible only to its author and to the
   * moderators of the community it was posted in.
   *
   * The same audience as the moderation actions on the post: analytics that
   * expose *who* read a post are as sensitive as the ability to remove it, so
   * the check reuses the role comparison rather than inventing a new one.
   */
  async getInsights(postId: number, userId: number) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        title: true,
        authorId: true,
        isDeleted: true,
        createdAt: true,
        viewCount: true,
        upvoteCount: true,
        downvoteCount: true,
        commentCount: true,
        shareCount: true,
        repostCount: true,
        awardCount: true,
        community: { select: { name: true } },
      },
    });

    if (!post || post.isDeleted) {
      throw new NotFoundException('Post not found');
    }

    await this.assertCanViewInsights(post, userId);

    // The chart covers the first `INSIGHTS_CHART_HOURS` after publication, so
    // it is anchored on `createdAt`, not on "now". Anchoring on now would slide
    // the window right as the post ages and the early spike would scroll off.
    const firstBucket = this.truncateToHour(post.createdAt);
    const elapsedHours = Math.floor(
      (Date.now() - firstBucket.getTime()) / HOUR_MS,
    );
    // Never emit buckets for hours that have not happened yet: a post from ten
    // minutes ago would otherwise show a chart stretching 48 hours into the
    // future, all of it zeros.
    const bucketCount = Math.max(
      0,
      Math.min(INSIGHTS_CHART_HOURS, elapsedHours + 1),
    );
    const lastBucket = new Date(
      firstBucket.getTime() + (bucketCount - 1) * HOUR_MS,
    );

    const [bucketRows, countryRows, recentViews] = await Promise.all([
      bucketCount === 0
        ? Promise.resolve([])
        : this.prisma.postViewStat.groupBy({
            by: ['bucketStart'],
            where: {
              postId,
              bucketStart: { gte: firstBucket, lte: lastBucket },
            },
            _sum: { views: true },
          }),
      this.prisma.postViewStat.groupBy({
        by: ['countryCode'],
        where: { postId },
        _sum: { views: true },
      }),
      this.prisma.postViewStat.aggregate({
        where: {
          postId,
          bucketStart: { gte: this.truncateToHour(this.hoursAgo(24)) },
        },
        _sum: { views: true },
      }),
    ]);

    const total = post.viewCount;

    return {
      postId: post.id,
      title: post.title,
      communityName: post.community.name,
      authorId: post.authorId,
      publishedAt: post.createdAt,
      reach: {
        views: total,
        viewsLast24h: recentViews._sum.views ?? 0,
        hoursTracked: bucketCount,
      },
      hourlyViews: this.buildHourlySeries(
        bucketRows as { bucketStart: Date; _sum: { views: number | null } }[],
        firstBucket,
        bucketCount,
      ),
      countries: this.buildCountryBreakdown(countryRows, total),
      engagement: {
        upvotes: post.upvoteCount,
        downvotes: post.downvoteCount,
        upvoteRatio: this.calculateUpvoteRatio(
          post.upvoteCount,
          post.downvoteCount,
        ),
        comments: post.commentCount,
        shares: post.shareCount,
        reposts: post.repostCount,
        awards: post.awardCount,
      },
    } satisfies PostInsightsResponseDto;
  }

  /**
   * Turns sparse grouped rows into the dense series the chart expects, keyed by
   * hour offset from publication.
   *
   * Anything outside the window is dropped rather than clamped: a bucket that
   * lands before `firstBucket` can only come from clock skew between the writer
   * and this reader, and clamping it would draw it as if it happened in hour 1.
   */
  private buildHourlySeries(
    rows: { bucketStart: Date; _sum: { views: number | null } }[],
    firstBucket: Date,
    bucketCount: number,
  ): InsightsHourlyViewDto[] {
    const byBucket = new Map<number, number>();
    for (const row of rows) {
      const offset = Math.round(
        (row.bucketStart.getTime() - firstBucket.getTime()) / HOUR_MS,
      );
      byBucket.set(offset, row._sum.views ?? 0);
    }

    const series: InsightsHourlyViewDto[] = [];
    for (let offset = 0; offset < bucketCount; offset += 1) {
      series.push({
        bucketStart: new Date(firstBucket.getTime() + offset * HOUR_MS),
        // Hour 1 is the first *full* hour after publication, matching how the
        // first hour is described on the readout.
        hour: offset + 1,
        views: byBucket.get(offset) ?? 0,
      });
    }

    return series;
  }

  /**
   * Splits views into the top countries and everything else.
   *
   * The "other" bucket is computed from the total rather than summed from the
   * rows, because the rollup may legitimately cover fewer views than
   * `Post.viewCount` (views recorded before the rollup existed, or a partial
   * write). Using `total - sum(top)` keeps the listed percentages honest
   * instead of silently dropping that difference.
   */
  private buildCountryBreakdown(
    rows: { countryCode: string; _sum: { views: number | null } }[],
    total: number,
  ): { top: InsightsCountryViewDto[]; other: InsightsCountryViewDto } {
    const sorted = [...rows]
      .map((row) => ({
        countryCode: row.countryCode,
        views: row._sum.views ?? 0,
      }))
      .filter((row) => row.views > 0)
      .sort(
        (a, b) =>
          b.views - a.views || a.countryCode.localeCompare(b.countryCode),
      );

    const top = sorted.slice(0, INSIGHTS_TOP_COUNTRIES);
    const topViews = top.reduce((totalViews, row) => totalViews + row.views, 0);
    const otherViews = Math.max(0, total - topViews);

    return {
      top: top.map((row) => this.toCountryView(row, total)),
      other: this.toCountryView(
        { countryCode: UNKNOWN_COUNTRY, views: otherViews },
        total,
      ),
    };
  }

  private toCountryView(
    row: { countryCode: string; views: number },
    total: number,
  ): InsightsCountryViewDto {
    return {
      countryCode: row.countryCode,
      views: row.views,
      percentage: this.toPercentage(row.views, total),
    };
  }

  /**
   * Null when nobody voted. A 0% ratio would read as "everyone downvoted this",
   * which is a different and much worse claim than "no votes yet".
   */
  private calculateUpvoteRatio(
    upvotes: number,
    downvotes: number,
  ): number | null {
    const total = upvotes + downvotes;
    return total === 0 ? null : this.toPercentage(upvotes, total);
  }

  private toPercentage(value: number, total: number): number {
    return total === 0 ? 0 : Math.round((value / total) * 1000) / 10;
  }

  /**
   * Identifies the visitor without storing who they are.
   *
   * A signed-in reader is keyed on their user id so the dedupe window works
   * across devices; an anonymous one falls back to the IP. Both are hashed: the
   * table only needs a stable bucket key, and storing the raw value would turn
   * the rollup's source data into a list of readers.
   */
  private buildViewerKey(viewer: { userId?: number; ip?: string }): string {
    const secret = process.env.JWT_SECRET ?? 'nexa-viewer-key';

    if (viewer.userId) {
      return createHmac('sha256', secret)
        .update(`u:${viewer.userId}`)
        .digest('hex');
    }

    return createHash('sha256')
      .update(`ip:${viewer.ip ?? 'unknown'}:${secret}`)
      .digest('hex');
  }

  /**
   * Accepts only real ISO 3166-1 alpha-2 codes, upper-cased.
   *
   * The value arrives from a request header, so it is untrusted input that
   * would otherwise end up as an unbounded grouping key in `post_view_stats`.
   * Anything unrecognised collapses to `XX` instead of being stored.
   */
  private normalizeCountryCode(value?: string): string {
    if (!value) {
      return UNKNOWN_COUNTRY;
    }

    const code = value.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : UNKNOWN_COUNTRY;
  }

  private truncateToHour(date: Date): Date {
    const truncated = new Date(date);
    truncated.setMinutes(0, 0, 0);
    return truncated;
  }

  private hoursAgo(hours: number): Date {
    return new Date(Date.now() - hours * HOUR_MS);
  }

  /**
   * Author always; otherwise a moderator or owner of the community the post
   * belongs to. Mirrors the role check the pin/lock actions use.
   */
  private async assertCanViewInsights(
    post: { id: number; authorId: number; community: { name: string } },
    userId: number,
  ): Promise<void> {
    if (post.authorId === userId) {
      return;
    }

    const membership = await this.prisma.communityMember.findFirst({
      where: {
        userId,
        role: { in: [CommunityRole.MODERATOR, CommunityRole.OWNER] },
        community: { posts: { some: { id: post.id } } },
      },
      select: { userId: true },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Only the post author or a community moderator can view these insights',
      );
    }
  }
}
