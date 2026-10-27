import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_FIELDS } from '../users/users.service';
import type { SearchType } from './dto/search-query.dto';
import { toPrefixTsQuery } from './search-query';

export interface SearchQuery {
  q: string;
  type: SearchType;
  page: number;
  limit: number;
  viewerId?: number;
}

/**
 * Full-text search over the `search_vector` columns (see the full-text search
 * migration). Matching and ranking run in raw SQL, which Prisma cannot
 * express; the matching rows are then loaded through Prisma so each type
 * keeps the same shape as its regular listing endpoint.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchQuery) {
    const tsQuery = toPrefixTsQuery(query.q);
    if (!tsQuery) {
      return this.page([], 0, query);
    }

    // Same unaccent as the indexed columns, so "cafe" and "café" meet.
    const match = Prisma.sql`to_tsquery('simple', immutable_unaccent(${tsQuery}))`;

    switch (query.type) {
      case 'posts':
        return this.searchPosts(match, query);
      case 'communities':
        return this.searchCommunities(match, query);
      case 'users':
        return this.searchUsers(match, query);
    }
  }

  /** Posts the viewer may read, as `GET /posts` decides it. */
  private async searchPosts(match: Prisma.Sql, query: SearchQuery) {
    const visible = query.viewerId
      ? Prisma.sql`(c.is_private = false OR EXISTS (
          SELECT 1 FROM community_members m
          WHERE m.community_id = c.id AND m.user_id = ${query.viewerId}
            AND m.banned_at IS NULL
        ))`
      : Prisma.sql`c.is_private = false`;

    const { ids, total } = await this.rank(
      Prisma.sql`p.id`,
      Prisma.sql`posts p JOIN communities c ON c.id = p.community_id`,
      Prisma.sql`p.search_vector @@ ${match} AND p.is_deleted = false AND ${visible}`,
      Prisma.sql`ts_rank(p.search_vector, ${match}) DESC, p.score DESC, p.id DESC`,
      query,
    );

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

    return this.page(inOrder(ids, posts), total, query);
  }

  /** Every community, private ones included, as `GET /communities` lists them. */
  private async searchCommunities(match: Prisma.Sql, query: SearchQuery) {
    const { ids, total } = await this.rank(
      Prisma.sql`c.id`,
      Prisma.sql`communities c`,
      Prisma.sql`c.search_vector @@ ${match}`,
      Prisma.sql`ts_rank(c.search_vector, ${match}) DESC, c.member_count DESC, c.id DESC`,
      query,
    );

    const communities = ids.length
      ? await this.prisma.community.findMany({
          where: { id: { in: ids } },
          include: {
            creator: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
        })
      : [];

    return this.page(inOrder(ids, communities), total, query);
  }

  /** Active users only: a deactivated account should not be discoverable. */
  private async searchUsers(match: Prisma.Sql, query: SearchQuery) {
    const { ids, total } = await this.rank(
      Prisma.sql`u.id`,
      Prisma.sql`users u`,
      Prisma.sql`u.search_vector @@ ${match} AND u.is_active = true`,
      Prisma.sql`ts_rank(u.search_vector, ${match}) DESC, u.karma DESC, u.id DESC`,
      query,
    );

    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: PUBLIC_USER_FIELDS,
        })
      : [];

    return this.page(inOrder(ids, users), total, query);
  }

  private async rank(
    id: Prisma.Sql,
    from: Prisma.Sql,
    where: Prisma.Sql,
    orderBy: Prisma.Sql,
    { page, limit }: SearchQuery,
  ) {
    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<{ id: number }[]>`
        SELECT ${id} AS id FROM ${from} WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `,
      this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS total FROM ${from} WHERE ${where}
      `,
    ]);

    return { ids: rows.map((row) => row.id), total: Number(total) };
  }

  private page<T>(data: T[], total: number, { page, limit }: SearchQuery) {
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

/** `IN` does not preserve order; the SQL ranking is the one that counts. */
function inOrder<T extends { id: number }>(ids: number[], rows: T[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
