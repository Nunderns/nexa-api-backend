import { PostType } from '@prisma/client';
import { PopularFeedService } from '../src/posts/popular-feed.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createCommunity,
  createTestPrisma,
  createUser,
  resetDatabase,
} from './db/test-database';

const HOUR_MS = 60 * 60 * 1000;

/**
 * The popular rankings are raw SQL, so they run against the real migrations
 * on the throwaway PGlite database rather than a mocked client.
 */
describe('Popular feed (integration)', () => {
  let prisma: PrismaService;
  let service: PopularFeedService;
  let authorId: number;
  let communityId: number;

  const query = (
    overrides: Partial<Parameters<PopularFeedService['find']>[0]> = {},
  ) =>
    service.find({ sort: 'hot', t: 'day', page: 1, limit: 20, ...overrides });

  const titles = async (
    overrides: Partial<Parameters<PopularFeedService['find']>[0]> = {},
  ) => (await query(overrides)).data.map((post) => post.title);

  function createPost(
    title: string,
    { score = 0, ageHours = 0, community = communityId } = {},
  ) {
    return prisma.post.create({
      data: {
        title,
        communityId: community,
        authorId,
        postType: PostType.TEXT,
        score,
        upvoteCount: Math.max(score, 0),
        createdAt: new Date(Date.now() - ageHours * HOUR_MS),
      },
    });
  }

  function addViews(
    postId: number,
    countryCode: string,
    views: number,
    hoursAgo = 0,
  ) {
    const bucketStart = new Date(
      Math.floor((Date.now() - hoursAgo * HOUR_MS) / HOUR_MS) * HOUR_MS,
    );
    return prisma.postViewStat.create({
      data: { postId, bucketStart, countryCode, views },
    });
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    await prisma.$connect();
    service = new PopularFeedService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    authorId = (await createUser(prisma, 'author')).id;
    communityId = (await createCommunity(prisma, authorId, 'public')).id;
  });

  it('hot weighs score against age', async () => {
    await createPost('old and big', { score: 1000, ageHours: 48 });
    await createPost('fresh and small', { score: 5 });
    await createPost('fresh and medium', { score: 50 });
    await createPost('fresh and downvoted', { score: -20 });

    // 48h is ~3.8 orders of magnitude of decay; 1000 only buys 3.
    expect(await titles()).toEqual([
      'fresh and medium',
      'fresh and small',
      'old and big',
      'fresh and downvoted',
    ]);
  });

  it('new orders by creation time', async () => {
    await createPost('oldest', { ageHours: 3 });
    await createPost('newest');
    await createPost('middle', { ageHours: 1 });

    expect(await titles({ sort: 'new' })).toEqual([
      'newest',
      'middle',
      'oldest',
    ]);
  });

  it('top ranks by score inside the rolling window', async () => {
    await createPost('yesterday huge', { score: 900, ageHours: 30 });
    await createPost('today 10', { score: 10, ageHours: 2 });
    await createPost('today 20', { score: 20, ageHours: 5 });

    expect(await titles({ sort: 'top', t: 'day' })).toEqual([
      'today 20',
      'today 10',
    ]);
    expect(await titles({ sort: 'top', t: 'week' })).toEqual([
      'yesterday huge',
      'today 20',
      'today 10',
    ]);
  });

  it('rising ranks recent posts by recent views', async () => {
    const slow = await createPost('slow', { score: 100, ageHours: 2 });
    const quick = await createPost('quick', { ageHours: 1 });
    const stale = await createPost('stale', { ageHours: 30 });
    await addViews(slow.id, 'BR', 2);
    await addViews(slow.id, 'BR', 500, 10); // outside the recent window
    await addViews(quick.id, 'BR', 40);
    await addViews(stale.id, 'BR', 999);

    expect(await titles({ sort: 'rising' })).toEqual(['quick', 'slow']);
  });

  it('geo keeps posts read from that country and ranks rising by its views', async () => {
    const brazil = await createPost('read in BR');
    const both = await createPost('read in BR and US');
    const usOnly = await createPost('read in US');
    await createPost('never read');
    await addViews(brazil.id, 'BR', 30);
    await addViews(both.id, 'BR', 5);
    await addViews(both.id, 'US', 500);
    await addViews(usOnly.id, 'US', 50);

    expect(await titles({ sort: 'rising', geo: 'BR' })).toEqual([
      'read in BR',
      'read in BR and US',
    ]);
    expect((await query({ sort: 'new', geo: 'US' })).total).toBe(2);
    expect((await query({ geo: 'FR' })).total).toBe(0);
  });

  it('excludes deleted posts and private or NSFW communities', async () => {
    const hidden = await createCommunity(prisma, authorId, 'secret', [], true);
    const nsfw = await prisma.community.create({
      data: {
        name: 'nsfw',
        displayName: 'nsfw',
        createdBy: authorId,
        isNsfw: true,
      },
    });
    await createPost('visible');
    await createPost('private', { community: hidden.id });
    await createPost('adult', { community: nsfw.id });
    const deleted = await createPost('deleted');
    await prisma.post.update({
      where: { id: deleted.id },
      data: { isDeleted: true },
    });

    const page = await query({ sort: 'new' });
    expect(page.data.map((post) => post.title)).toEqual(['visible']);
    expect(page.total).toBe(1);
  });

  it('paginates without overlap and returns the feed shape', async () => {
    for (let i = 0; i < 5; i++) {
      await createPost(`post ${i}`, { score: 10 });
    }

    const first = await query({ limit: 2 });
    const second = await query({ limit: 2, page: 2 });
    const third = await query({ limit: 2, page: 3 });

    const ids = [...first.data, ...second.data, ...third.data].map((p) => p.id);
    expect(new Set(ids).size).toBe(5);
    expect(first).toMatchObject({ total: 5, page: 1, limit: 2, totalPages: 3 });
    expect(first.data[0]).toMatchObject({
      community: { name: 'public' },
      author: { username: 'author' },
    });
  });
});
