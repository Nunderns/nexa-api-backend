import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  HOT_DECAY_SECONDS,
  POPULAR_TIME_WINDOW_MS,
  RISING_MAX_AGE_MS,
  RISING_VIEW_WINDOW_HOURS,
  type PopularSort,
  type PopularTimeWindow,
} from './popular.constants';

export interface PopularFeedQuery {
  sort: PopularSort;
  t: PopularTimeWindow;
  geo?: string;
  page: number;
  limit: number;
}

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class PopularFeedService {
  constructor(private readonly prisma: PrismaService) {}

  async find(query: PopularFeedQuery) {
    const { page, limit } = query;
    const now = new Date();
    const where = this.buildWhere(query, now);

    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<{ id: number }[]>`
        SELECT p.id
        FROM posts p
        JOIN communities c ON c.id = p.community_id
        WHERE ${where}
        ORDER BY ${this.buildOrderBy(query, now)}
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `,
      this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS total
        FROM posts p
        JOIN communities c ON c.id = p.community_id
        WHERE ${where}
      `,
    ]);

    const ids = rows.map((row) => row.id);
    const posts = ids.length
      ? await this.prisma.post.findMany({
          where: { id: { in: ids } },
          include: {
            community: {
              select: {
                id: true,
                name: true,
                displayName: true,
                iconUrl: true,
              },
            },
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        })
      : [];

    // `IN` does not preserve order; the SQL ranking is the one that counts.
    const byId = new Map(posts.map((post) => [post.id, post]));
    const totalCount = Number(total);

    return {
      data: ids.flatMap((id) => byId.get(id) ?? []),
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }

  private buildWhere(query: PopularFeedQuery, now: Date): Prisma.Sql {
    const conditions = [
      Prisma.sql`p.is_deleted = false`,
      Prisma.sql`c.is_private = false`,
      Prisma.sql`c.is_nsfw = false`,
    ];

    let windowMs: number | null = null;
    if (query.sort === 'top') {
      windowMs = POPULAR_TIME_WINDOW_MS[query.t];
    } else if (query.sort === 'rising') {
      windowMs = RISING_MAX_AGE_MS;
    }

    if (windowMs !== null) {
      conditions.push(
        Prisma.sql`p.created_at >= ${new Date(now.getTime() - windowMs)}`,
      );
    }

    if (query.geo) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM post_view_stats s
        WHERE s.post_id = p.id AND s.country_code = ${query.geo} AND s.views > 0
      )`);
    }

    return Prisma.join(conditions, ' AND ');
  }

  /** Every ranking ends on `p.id DESC` so pages never overlap on ties. */
  private buildOrderBy(query: PopularFeedQuery, now: Date): Prisma.Sql {
    switch (query.sort) {
      case 'new':
        return Prisma.sql`p.created_at DESC, p.id DESC`;
      case 'top':
        return Prisma.sql`p.score DESC, p.id DESC`;
      case 'rising': {
        // Views in the last few hourly buckets, from the filtered country
        // when there is one: what is picking up readers right now.
        const since = new Date(
          Math.floor(now.getTime() / HOUR_MS) * HOUR_MS -
            (RISING_VIEW_WINDOW_HOURS - 1) * HOUR_MS,
        );
        const country = query.geo
          ? Prisma.sql`AND s.country_code = ${query.geo}`
          : Prisma.empty;
        return Prisma.sql`(
          SELECT COALESCE(SUM(s.views), 0) FROM post_view_stats s
          WHERE s.post_id = p.id AND s.bucket_start >= ${since} ${country}
        ) DESC, p.score DESC, p.created_at DESC, p.id DESC`;
      }
      case 'hot':
      default:
        // Reddit's hot ranking: log10 of the score plus age, so a post needs
        // ten times the score to beat one HOT_DECAY_SECONDS newer.
        return Prisma.sql`(
          SIGN(p.score) * LOG(GREATEST(ABS(p.score), 1))
          + EXTRACT(EPOCH FROM p.created_at) / ${HOT_DECAY_SECONDS}
        ) DESC, p.id DESC`;
    }
  }
}
