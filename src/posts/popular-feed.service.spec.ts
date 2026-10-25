import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PopularFeedController } from './popular-feed.controller';
import { PopularFeedQuery, PopularFeedService } from './popular-feed.service';

/**
 * The rankings themselves run against real Postgres in
 * `test/popular-feed.integration.e2e-spec.ts`. These cover what the service
 * does around the SQL: which filters it adds per sort, the order it restores
 * and the envelope it returns.
 */
describe('PopularFeedService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    post: { findMany: jest.fn() },
  };
  const service = new PopularFeedService(prisma as unknown as PrismaService);

  const query = (overrides: Partial<PopularFeedQuery> = {}) =>
    service.find({ sort: 'hot', t: 'day', page: 1, limit: 20, ...overrides });

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
    jest.useFakeTimers({ now: new Date('2026-10-25T12:30:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the SQL ranking, not the order findMany returns', async () => {
    mockResults([3, 1, 2], 23);
    prisma.post.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    await expect(query({ page: 2, limit: 10 })).resolves.toEqual({
      data: [{ id: 3 }, { id: 1 }, { id: 2 }],
      total: 23,
      page: 2,
      limit: 10,
      totalPages: 3,
    });
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [3, 1, 2] } } }),
    );
    expect(pageSql().values).toEqual(expect.arrayContaining([10, 10]));
  });

  it('drops a post deleted between the two queries', async () => {
    mockResults([5, 6], 2);
    prisma.post.findMany.mockResolvedValue([{ id: 6 }]);

    await expect(query()).resolves.toMatchObject({ data: [{ id: 6 }] });
  });

  it('skips loading posts for an empty page', async () => {
    mockResults([], 0);

    await expect(query()).resolves.toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });

  it('only reads public, non-NSFW, undeleted posts', async () => {
    mockResults([], 0);
    await query();

    const { text } = pageSql();
    expect(text).toContain('p.is_deleted = false');
    expect(text).toContain('c.is_private = false');
    expect(text).toContain('c.is_nsfw = false');
  });

  it('hot and new have no age limit', async () => {
    mockResults([], 0);
    await query({ sort: 'new' });

    const { text } = pageSql();
    expect(text).not.toContain('p.created_at >=');
    expect(text).toContain('ORDER BY p.created_at DESC, p.id DESC');
  });

  it('top limits to the rolling window', async () => {
    mockResults([], 0);
    await query({ sort: 'top', t: 'week' });

    const { text, values } = pageSql();
    expect(text).toContain('p.created_at >=');
    expect(values).toContainEqual(new Date('2026-10-18T12:30:00.000Z'));
    expect(text).toContain('ORDER BY p.score DESC, p.id DESC');
  });

  it('top over all time has no age limit', async () => {
    mockResults([], 0);
    await query({ sort: 'top', t: 'all' });

    expect(pageSql().text).not.toContain('p.created_at >=');
  });

  it('rising looks at the last day and the last three hourly buckets', async () => {
    mockResults([], 0);
    await query({ sort: 'rising' });

    const { values } = pageSql();
    expect(values).toContainEqual(new Date('2026-10-24T12:30:00.000Z'));
    expect(values).toContainEqual(new Date('2026-10-25T10:00:00.000Z'));
  });

  it('geo filters by audience and scopes rising views to the country', async () => {
    mockResults([], 0);
    await query({ sort: 'rising', geo: 'BR' });

    const { text, values } = pageSql();
    expect(text).toContain('EXISTS');
    expect(text).toContain('AND s.country_code =');
    expect(values.filter((value) => value === 'BR')).toHaveLength(2);
  });
});

describe('PopularFeedController', () => {
  it('fills in the defaults the DTO would apply', async () => {
    const popularFeed = { find: jest.fn().mockResolvedValue('page') };
    const controller = new PopularFeedController(
      popularFeed as unknown as PopularFeedService,
    );

    await expect(controller.find({})).resolves.toBe('page');
    expect(popularFeed.find).toHaveBeenCalledWith({
      sort: 'hot',
      t: 'day',
      geo: undefined,
      page: 1,
      limit: 20,
    });
  });
});
