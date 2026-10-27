import { PostType } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { SearchService, type SearchQuery } from '../src/search/search.service';
import {
  createCommunity,
  createTestPrisma,
  createUser,
  resetDatabase,
} from './db/test-database';

/**
 * Search runs on generated tsvector columns and raw SQL, so it is tested
 * against the real migrations on the throwaway PGlite database.
 */
describe('Search (integration)', () => {
  let prisma: PrismaService;
  let service: SearchService;
  let authorId: number;
  let communityId: number;

  const search = (q: string, overrides: Partial<SearchQuery> = {}) =>
    service.search({ q, type: 'posts', page: 1, limit: 20, ...overrides });

  const names = async (
    q: string,
    field: string,
    overrides: Partial<SearchQuery> = {},
  ) =>
    (await search(q, overrides)).data.map(
      (row) => (row as Record<string, unknown>)[field],
    );

  const titles = (q: string, overrides: Partial<SearchQuery> = {}) =>
    names(q, 'title', overrides);

  function createPost(
    title: string,
    {
      content = null as string | null,
      community = communityId,
      isDeleted = false,
    } = {},
  ) {
    return prisma.post.create({
      data: {
        title,
        content,
        communityId: community,
        authorId,
        postType: PostType.TEXT,
        isDeleted,
      },
    });
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    await prisma.$connect();
    service = new SearchService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    authorId = (await createUser(prisma, 'author')).id;
    communityId = (await createCommunity(prisma, authorId, 'public')).id;
  });

  describe('posts', () => {
    it('ignores accents in both directions', async () => {
      await createPost('Melhor café de São Paulo');

      await expect(titles('cafe sao')).resolves.toEqual([
        'Melhor café de São Paulo',
      ]);
      await expect(titles('CAFÉ')).resolves.toEqual([
        'Melhor café de São Paulo',
      ]);
    });

    it('treats the last word as a prefix and requires every word', async () => {
      await createPost('Learning React hooks');
      await createPost('React Native tips');

      await expect(titles('react hoo')).resolves.toEqual([
        'Learning React hooks',
      ]);
      await expect(titles('hooks react')).resolves.toEqual([
        'Learning React hooks',
      ]);
      await expect(titles('react angular')).resolves.toEqual([]);
    });

    it('matches the content too, but ranks a title match first', async () => {
      await createPost('Weekend plans', {
        content: 'Maybe some postgres tuning',
      });
      await createPost('Postgres tuning guide');

      await expect(titles('postgres')).resolves.toEqual([
        'Postgres tuning guide',
        'Weekend plans',
      ]);
    });

    it('follows edits, since the vector is generated from the row', async () => {
      const post = await createPost('Draft');
      await prisma.post.update({
        where: { id: post.id },
        data: { title: 'Final title' },
      });

      await expect(titles('draft')).resolves.toEqual([]);
      await expect(titles('final')).resolves.toEqual(['Final title']);
    });

    it('skips deleted posts', async () => {
      await createPost('Visible kotlin post');
      await createPost('Deleted kotlin post', { isDeleted: true });

      await expect(titles('kotlin')).resolves.toEqual(['Visible kotlin post']);
    });

    it('shows private communities only to members who are not banned', async () => {
      const memberId = (await createUser(prisma, 'member')).id;
      const bannedId = (await createUser(prisma, 'banned')).id;
      const outsiderId = (await createUser(prisma, 'outsider')).id;
      const secret = await createCommunity(
        prisma,
        authorId,
        'secret',
        [memberId, bannedId],
        true,
      );
      await prisma.communityMember.update({
        where: {
          communityId_userId: { communityId: secret.id, userId: bannedId },
        },
        data: { bannedAt: new Date() },
      });
      await createPost('Private golang notes', { community: secret.id });

      await expect(titles('golang')).resolves.toEqual([]);
      await expect(titles('golang', { viewerId: outsiderId })).resolves.toEqual(
        [],
      );
      await expect(titles('golang', { viewerId: bannedId })).resolves.toEqual(
        [],
      );
      await expect(titles('golang', { viewerId: memberId })).resolves.toEqual([
        'Private golang notes',
      ]);
    });

    it('paginates and reports the full total', async () => {
      for (let i = 0; i < 5; i++) {
        await createPost(`Rust tip ${i}`);
      }

      const result = await search('rust', { page: 2, limit: 2 });

      expect(result).toMatchObject({
        total: 5,
        page: 2,
        limit: 2,
        totalPages: 3,
      });
      expect(result.data).toHaveLength(2);
    });

    it('returns nothing for input with no words', async () => {
      await createPost('Anything');

      await expect(search('!!! ::')).resolves.toMatchObject({
        data: [],
        total: 0,
      });
    });
  });

  describe('communities', () => {
    it('matches name, display name and description', async () => {
      await prisma.community.update({
        where: { id: communityId },
        data: {
          displayName: 'Programação Funcional',
          description: 'Haskell e Elixir',
        },
      });

      for (const q of ['public', 'programacao', 'elix']) {
        await expect(
          names(q, 'name', { type: 'communities' }),
        ).resolves.toEqual(['public']);
      }
    });

    it('breaks rank ties by member count', async () => {
      await createCommunity(prisma, authorId, 'gaming_small');
      const big = await createCommunity(prisma, authorId, 'gaming_big');
      await prisma.community.update({
        where: { id: big.id },
        data: { memberCount: 50 },
      });

      await expect(
        names('gaming', 'name', { type: 'communities' }),
      ).resolves.toEqual(['gaming_big', 'gaming_small']);
    });
  });

  describe('users', () => {
    it('matches username and display name and returns only public fields', async () => {
      const user = await createUser(prisma, 'jose_silva');
      await prisma.user.update({
        where: { id: user.id },
        data: { displayName: 'José Silva' },
      });

      const result = await search('jose', { type: 'users' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ username: 'jose_silva' });
      expect(result.data[0]).not.toHaveProperty('email');
      expect(result.data[0]).not.toHaveProperty('passwordHash');
    });

    it('hides deactivated users', async () => {
      const user = await createUser(prisma, 'ghost');
      await prisma.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });

      await expect(search('ghost', { type: 'users' })).resolves.toMatchObject({
        data: [],
        total: 0,
      });
    });
  });
});
