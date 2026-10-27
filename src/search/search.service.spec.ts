import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_FIELDS } from '../users/users.service';
import { SearchController } from './search.controller';
import { SearchQuery, SearchService } from './search.service';

/**
 * Covers what the service does around the SQL: which filters it adds per
 * type, the order it restores and the envelope it returns.
 */
describe('SearchService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    post: { findMany: jest.fn() },
    community: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const service = new SearchService(prisma as unknown as PrismaService);

  const search = (overrides: Partial<SearchQuery> = {}) =>
    service.search({
      q: 'react',
      type: 'posts',
      page: 1,
      limit: 20,
      ...overrides,
    });

  /** The SQL text and bound values of the page query. */
  const pageSql = () => {
    const [strings, ...values] = prisma.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = Prisma.sql(strings, ...values);
    return { text: sql.sql, values: sql.values };
  };

  const mockResults = (ids: number[], total: number) => {
    prisma.$queryRaw
      .mockResolvedValueOnce(ids.map((id) => ({ id })))
      .mockResolvedValueOnce([{ total: BigInt(total) }]);
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns an empty page without querying when nothing is searchable', async () => {
    await expect(search({ q: '!!!' })).resolves.toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('binds the prefix tsquery and paginates', async () => {
    mockResults([], 0);
    await search({ q: 'nest rea', page: 3, limit: 10 });

    const { text, values } = pageSql();
    expect(text).toContain("to_tsquery('simple', immutable_unaccent(");
    expect(values).toContain('nest & rea:*');
    expect(values).toEqual(expect.arrayContaining([10, 20]));
  });

  describe('posts', () => {
    it('keeps the SQL ranking, not the order findMany returns', async () => {
      mockResults([3, 1, 2], 23);
      prisma.post.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

      await expect(search({ page: 2, limit: 10 })).resolves.toEqual({
        data: [{ id: 3 }, { id: 1 }, { id: 2 }],
        total: 23,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [3, 1, 2] } } }),
      );
    });

    it('drops a post deleted between the two queries', async () => {
      mockResults([5, 6], 2);
      prisma.post.findMany.mockResolvedValue([{ id: 6 }]);

      await expect(search()).resolves.toMatchObject({ data: [{ id: 6 }] });
    });

    it('skips loading posts for an empty page', async () => {
      mockResults([], 0);

      await expect(search()).resolves.toMatchObject({ data: [], total: 0 });
      expect(prisma.post.findMany).not.toHaveBeenCalled();
    });

    it('only shows undeleted posts from public communities to anonymous viewers', async () => {
      mockResults([], 0);
      await search();

      const { text } = pageSql();
      expect(text).toContain('p.is_deleted = false');
      expect(text).toContain('c.is_private = false');
      expect(text).not.toContain('community_members');
    });

    it('also shows private communities the viewer is an unbanned member of', async () => {
      mockResults([], 0);
      await search({ viewerId: 42 });

      const { text, values } = pageSql();
      expect(text).toContain('community_members');
      expect(text).toContain('m.banned_at IS NULL');
      expect(values).toContain(42);
    });
  });

  describe('communities', () => {
    it('ranks by relevance then members and restores the order', async () => {
      mockResults([2, 1], 2);
      prisma.community.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      await expect(search({ type: 'communities' })).resolves.toMatchObject({
        data: [{ id: 2 }, { id: 1 }],
        total: 2,
        totalPages: 1,
      });
      expect(pageSql().text).toContain('c.member_count DESC');
      expect(prisma.community.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [2, 1] } } }),
      );
    });

    it('skips loading communities for an empty page', async () => {
      mockResults([], 0);

      await expect(search({ type: 'communities' })).resolves.toMatchObject({
        data: [],
      });
      expect(prisma.community.findMany).not.toHaveBeenCalled();
    });
  });

  describe('users', () => {
    it('only finds active users and returns their public fields', async () => {
      mockResults([7], 1);
      prisma.user.findMany.mockResolvedValue([{ id: 7 }]);

      await expect(search({ type: 'users' })).resolves.toMatchObject({
        data: [{ id: 7 }],
        total: 1,
      });
      const { text } = pageSql();
      expect(text).toContain('u.is_active = true');
      expect(text).toContain('u.karma DESC');
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: [7] } },
        select: PUBLIC_USER_FIELDS,
      });
    });

    it('skips loading users for an empty page', async () => {
      mockResults([], 0);

      await expect(search({ type: 'users' })).resolves.toMatchObject({
        data: [],
      });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });
});

describe('SearchController', () => {
  const searchService = { search: jest.fn() };
  const controller = new SearchController(
    searchService as unknown as SearchService,
  );

  beforeEach(() => {
    searchService.search.mockReset().mockResolvedValue('page');
  });

  it('fills in the defaults the DTO would apply', async () => {
    await expect(controller.search({ q: 'react' })).resolves.toBe('page');
    expect(searchService.search).toHaveBeenCalledWith({
      q: 'react',
      type: 'posts',
      page: 1,
      limit: 20,
      viewerId: undefined,
    });
  });

  it('passes the query and the viewer through', async () => {
    await controller.search({ q: 'ana', type: 'users', page: 2, limit: 5 }, 9);
    expect(searchService.search).toHaveBeenCalledWith({
      q: 'ana',
      type: 'users',
      page: 2,
      limit: 5,
      viewerId: 9,
    });
  });
});
