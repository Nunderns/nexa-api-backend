/**
 * Development database seed.
 *
 * Usage: `npm run seed` (or `npx prisma db seed`).
 *
 * The seed is idempotent: every record is looked up by a natural key
 * (username, community name, post title, storage key, ...) and is created only
 * when missing, otherwise it is brought back to the state described in
 * `data.ts`. Nothing is ever deleted, so running it repeatedly is safe.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { CommunityRole } from '@prisma/client';
import {
  communities,
  MEDIA_BASE_URL,
  postInsights,
  posts,
  refreshTokens,
  SeedComment,
  SeedMedia,
  users,
} from './data';
import {
  createRandom,
  hoursAfter,
  hoursAgo,
  seedFromString,
  sha256,
} from './utils';

/** Shared password for every seeded account. Development use only. */
const DEFAULT_PASSWORD = 'NexaDev#2026';
const BCRYPT_ROUNDS = 10;

/**
 * Matches `INSIGHTS_CHART_HOURS` in the API. Duplicated rather than imported
 * because the seed runs outside `src/` and importing application code here
 * would make `npm run seed` depend on the Nest build being current.
 */
const INSIGHTS_CHART_HOURS = 48;

type IdMap = Map<string, number>;

interface SeedContext {
  prisma: PrismaClient;
  now: Date;
  userIds: IdMap;
  communityIds: IdMap;
  postIds: IdMap;
  commentIds: number[];
}

const HOUR_MS = 60 * 60 * 1000;

function requireId(map: IdMap, key: string, kind: string): number {
  const id = map.get(key);
  if (id === undefined) {
    throw new Error(`Seed data references unknown ${kind} "${key}"`);
  }
  return id;
}

async function seedUsers(ctx: SeedContext): Promise<void> {
  const password = process.env.SEED_USER_PASSWORD ?? DEFAULT_PASSWORD;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  for (const user of users) {
    const profile = {
      email: `${user.username.replace('_', '.')}@example.com`,
      displayName: user.displayName,
      bio: user.bio ?? null,
      avatarUrl: user.hasAvatar
        ? `${MEDIA_BASE_URL}/avatars/${user.username}.png`
        : null,
      isActive: user.isActive ?? true,
      passwordHash,
    };

    const record = await ctx.prisma.user.upsert({
      where: { username: user.username },
      update: profile,
      create: {
        ...profile,
        username: user.username,
        createdAt: hoursAgo(user.joinedHoursAgo, ctx.now),
        updatedAt: hoursAgo(user.joinedHoursAgo, ctx.now),
      },
      select: { id: true },
    });
    ctx.userIds.set(user.username, record.id);
  }
}

async function seedCommunities(ctx: SeedContext): Promise<void> {
  for (const community of communities) {
    const createdAt = hoursAgo(community.createdHoursAgo, ctx.now);
    const details = {
      displayName: community.displayName,
      description: community.description,
      iconUrl: `${MEDIA_BASE_URL}/communities/${community.name}/icon.png`,
      bannerUrl: `${MEDIA_BASE_URL}/communities/${community.name}/banner.jpg`,
      isPrivate: community.isPrivate ?? false,
      isNsfw: community.isNsfw ?? false,
      createdBy: requireId(ctx.userIds, community.creator, 'user'),
    };

    const record = await ctx.prisma.community.upsert({
      where: { name: community.name },
      update: details,
      create: {
        ...details,
        name: community.name,
        createdAt,
        updatedAt: createdAt,
      },
      select: { id: true, createdAt: true },
    });
    ctx.communityIds.set(community.name, record.id);

    const memberships = [
      { username: community.creator, role: CommunityRole.OWNER, banned: false },
      ...community.members,
    ];

    for (const [index, membership] of memberships.entries()) {
      const joinedAt = hoursAfter(record.createdAt, index * 6);
      const userId = requireId(ctx.userIds, membership.username, 'user');
      const bannedAt = membership.banned ? hoursAfter(joinedAt, 24 * 3) : null;

      await ctx.prisma.communityMember.upsert({
        where: { communityId_userId: { communityId: record.id, userId } },
        update: { role: membership.role, bannedAt },
        create: {
          communityId: record.id,
          userId,
          role: membership.role,
          joinedAt,
          bannedAt,
        },
      });
    }
  }
}

async function seedMedia(
  ctx: SeedContext,
  media: SeedMedia,
  owner: { userId: number; postId?: number; commentId?: number },
  createdAt: Date,
): Promise<void> {
  const existing = await ctx.prisma.media.findFirst({
    where: { storageKey: media.storageKey },
    select: { id: true },
  });
  const data = {
    ...owner,
    url: `${MEDIA_BASE_URL}/${media.storageKey}`,
    mimeType: media.mimeType,
    sizeBytes: BigInt(media.sizeBytes),
  };

  if (existing) {
    await ctx.prisma.media.update({ where: { id: existing.id }, data });
  } else {
    await ctx.prisma.media.create({
      data: { ...data, storageKey: media.storageKey, createdAt },
    });
  }
}

async function seedComment(
  ctx: SeedContext,
  comment: SeedComment,
  postId: number,
  postCreatedAt: Date,
  parentId: number | null,
): Promise<void> {
  const authorId = requireId(ctx.userIds, comment.author, 'user');
  const createdAt = hoursAfter(postCreatedAt, comment.hoursAfterPost);

  const existing = await ctx.prisma.comment.findFirst({
    where: { postId, authorId, parentId, content: comment.content },
    select: { id: true },
  });
  const isDeleted = comment.isDeleted ?? false;

  const { id } = existing
    ? await ctx.prisma.comment.update({
        where: { id: existing.id },
        data: { isDeleted },
        select: { id: true },
      })
    : await ctx.prisma.comment.create({
        data: {
          postId,
          authorId,
          parentId,
          content: comment.content,
          isDeleted,
          createdAt,
          updatedAt: createdAt,
        },
        select: { id: true },
      });
  ctx.commentIds.push(id);

  if (comment.media) {
    await seedMedia(
      ctx,
      comment.media,
      { userId: authorId, commentId: id },
      createdAt,
    );
  }

  for (const reply of comment.replies ?? []) {
    await seedComment(ctx, reply, postId, postCreatedAt, id);
  }
}

async function seedPosts(ctx: SeedContext): Promise<void> {
  for (const post of posts) {
    const communityId = requireId(
      ctx.communityIds,
      post.community,
      'community',
    );
    const authorId = requireId(ctx.userIds, post.author, 'user');
    const details = {
      content: post.content ?? null,
      postType: post.postType,
      isPinned: post.isPinned ?? false,
      isLocked: post.isLocked ?? false,
      isDeleted: post.isDeleted ?? false,
    };

    const existing = await ctx.prisma.post.findFirst({
      where: { communityId, authorId, title: post.title },
      select: { id: true, createdAt: true },
    });

    const createdAt = hoursAgo(post.createdHoursAgo, ctx.now);
    const record = existing
      ? await ctx.prisma.post.update({
          where: { id: existing.id },
          data: details,
          select: { id: true, createdAt: true },
        })
      : await ctx.prisma.post.create({
          data: {
            ...details,
            communityId,
            authorId,
            title: post.title,
            createdAt,
            updatedAt: createdAt,
          },
          select: { id: true, createdAt: true },
        });
    ctx.postIds.set(post.key, record.id);

    for (const media of post.media ?? []) {
      await seedMedia(
        ctx,
        media,
        { userId: authorId, postId: record.id },
        record.createdAt,
      );
    }

    for (const comment of post.comments ?? []) {
      await seedComment(ctx, comment, record.id, record.createdAt, null);
    }
  }
}

/**
 * Generates votes from community members using a fixed-seed PRNG so the same
 * votes are produced on every run. Existing votes are left untouched.
 */
async function seedVotes(ctx: SeedContext): Promise<void> {
  const inactive = new Set(
    users.filter((u) => u.isActive === false).map((u) => u.username),
  );
  const votersByCommunity = new Map<string, string[]>();
  for (const community of communities) {
    const voters = [
      community.creator,
      ...community.members.filter((m) => !m.banned).map((m) => m.username),
    ].filter((username) => !inactive.has(username));
    votersByCommunity.set(community.name, voters);
  }

  const postVotes: { userId: number; postId: number; vote: number }[] = [];
  for (const post of posts) {
    if (post.isDeleted) continue;
    const postId = requireId(ctx.postIds, post.key, 'post');
    const random = createRandom(seedFromString(`post:${post.key}`));

    for (const voter of votersByCommunity.get(post.community) ?? []) {
      if (voter === post.author) continue;
      const roll = random();
      if (roll < 0.65) {
        postVotes.push({
          userId: requireId(ctx.userIds, voter, 'user'),
          postId,
          vote: 1,
        });
      } else if (roll < 0.8) {
        postVotes.push({
          userId: requireId(ctx.userIds, voter, 'user'),
          postId,
          vote: -1,
        });
      }
    }
  }

  const comments = await ctx.prisma.comment.findMany({
    where: { id: { in: ctx.commentIds }, isDeleted: false },
    select: {
      id: true,
      authorId: true,
      content: true,
      post: { select: { community: { select: { name: true } } } },
    },
    orderBy: { id: 'asc' },
  });

  const commentVotes: { userId: number; commentId: number; vote: number }[] =
    [];
  for (const comment of comments) {
    const random = createRandom(
      seedFromString(`comment:${comment.authorId}:${comment.content}`),
    );
    for (const voter of votersByCommunity.get(comment.post.community.name) ??
      []) {
      const userId = requireId(ctx.userIds, voter, 'user');
      if (userId === comment.authorId) continue;
      const roll = random();
      if (roll < 0.5) {
        commentVotes.push({ userId, commentId: comment.id, vote: 1 });
      } else if (roll < 0.6) {
        commentVotes.push({ userId, commentId: comment.id, vote: -1 });
      }
    }
  }

  await ctx.prisma.postVote.createMany({
    data: postVotes,
    skipDuplicates: true,
  });
  await ctx.prisma.commentVote.createMany({
    data: commentVotes,
    skipDuplicates: true,
  });
}

async function seedRefreshTokens(ctx: SeedContext): Promise<void> {
  for (const token of refreshTokens) {
    const userId = requireId(ctx.userIds, token.username, 'user');
    const tokenHash = sha256(
      `nexa-seed-refresh-token:${token.username}:${token.label}`,
    );
    const expiresAt = hoursAfter(ctx.now, token.expiresInHours);
    const revokedAt = token.revoked ? hoursAgo(1, ctx.now) : null;

    await ctx.prisma.refreshToken.upsert({
      where: { tokenHash },
      update: { userId, expiresAt, revokedAt },
      create: { userId, tokenHash, expiresAt, revokedAt },
    });
  }
}

/**
 * Builds an hourly view history from a post's reach profile.
 *
 * The shape is a decaying curve: the first hour sets the scale and every later
 * hour is the previous one times `decay`, with a small deterministic jitter so
 * the chart does not look like a smooth exponential. Traffic is also spread
 * across countries by the profile's shares, which is what makes the country
 * breakdown add up to the post's total.
 *
 * One hour per bucket, matching what `InsightsService.recordView` writes, so a
 * seeded post and a live one are indistinguishable to the insights endpoint.
 */
async function seedPostInsights(ctx: SeedContext): Promise<void> {
  for (const profile of postInsights) {
    const postId = requireId(ctx.postIds, profile.postKey, 'post');
    const post = await ctx.prisma.post.findUnique({
      where: { id: postId },
      select: { createdAt: true },
    });

    if (!post) {
      continue;
    }

    const hoursElapsed = Math.max(
      1,
      Math.floor((ctx.now.getTime() - post.createdAt.getTime()) / HOUR_MS),
    );
    // The insights chart only ever shows the first 48 hours, so seeding more
    // than that would write rows no endpoint can read.
    const hours = Math.min(hoursElapsed, INSIGHTS_CHART_HOURS);

    const random = createRandom(seedFromString(`insights:${profile.postKey}`));
    const buckets: {
      bucketStart: Date;
      countryCode: string;
      views: number;
    }[] = [];

    let hourly = profile.firstHourViews;

    for (let hour = 0; hour < hours; hour += 1) {
      const jitter = 0.6 + random() * 0.8;
      const views = Math.max(0, Math.round(hourly * jitter));
      const bucketStart = new Date(post.createdAt.getTime() + hour * HOUR_MS);
      // The migration's check constraint rejects an un-truncated bucket, and
      // an un-truncated value would also create a second row for the same hour.
      bucketStart.setMinutes(0, 0, 0);

      for (const country of profile.countries) {
        const countryViews = Math.round(views * country.share);
        if (countryViews === 0) {
          continue;
        }

        buckets.push({
          bucketStart,
          countryCode: country.code,
          views: countryViews,
        });
      }

      hourly *= profile.decay;
    }

    await ctx.prisma.postViewStat.createMany({
      data: buckets.map((bucket) => ({ postId, ...bucket })),
      skipDuplicates: true,
    });

    // Summed from the rows that were actually written rather than from the
    // curve, so `viewCount` and the chart cannot disagree: the country
    // breakdown derives its "other" bucket from this total.
    const totalViews = buckets.reduce((sum, bucket) => sum + bucket.views, 0);

    await ctx.prisma.post.update({
      where: { id: postId },
      data: {
        viewCount: totalViews,
        shareCount: profile.shares ?? 0,
        repostCount: profile.reposts ?? 0,
        awardCount: profile.awards ?? 0,
      },
    });
  }
}

/**
 * Recomputes the denormalized counters (scores, vote/comment/member/post counts,
 * karma) from the actual rows, scoped to the seeded records.
 */
async function syncCounters(ctx: SeedContext): Promise<void> {
  const userIds = [...ctx.userIds.values()];
  const communityIds = [...ctx.communityIds.values()];
  const postIds = [...ctx.postIds.values()];
  const { prisma } = ctx;

  await prisma.$executeRaw`
    UPDATE comments c SET
      upvote_count = v.up,
      downvote_count = v.down,
      score = v.up - v.down
    FROM (
      SELECT c2.id,
        COUNT(cv.*) FILTER (WHERE cv.vote > 0)::int AS up,
        COUNT(cv.*) FILTER (WHERE cv.vote < 0)::int AS down
      FROM comments c2
      LEFT JOIN comment_votes cv ON cv.comment_id = c2.id
      WHERE c2.post_id = ANY(${postIds})
      GROUP BY c2.id
    ) v
    WHERE c.id = v.id`;

  await prisma.$executeRaw`
    UPDATE posts p SET
      upvote_count = v.up,
      downvote_count = v.down,
      score = v.up - v.down,
      comment_count = (
        SELECT COUNT(*)::int FROM comments c
        WHERE c.post_id = p.id AND c.is_deleted = false
      ),
      view_count = COALESCE((
        SELECT SUM(s.views)::int FROM post_view_stats s
        WHERE s.post_id = p.id
      ), 0)
    FROM (
      SELECT p2.id,
        COUNT(pv.*) FILTER (WHERE pv.vote > 0)::int AS up,
        COUNT(pv.*) FILTER (WHERE pv.vote < 0)::int AS down
      FROM posts p2
      LEFT JOIN post_votes pv ON pv.post_id = p2.id
      WHERE p2.id = ANY(${postIds})
      GROUP BY p2.id
    ) v
    WHERE p.id = v.id`;

  await prisma.$executeRaw`
    UPDATE communities co SET
      member_count = (
        SELECT COUNT(*)::int FROM community_members m
        WHERE m.community_id = co.id AND m.banned_at IS NULL
      ),
      post_count = (
        SELECT COUNT(*)::int FROM posts p
        WHERE p.community_id = co.id AND p.is_deleted = false
      )
    WHERE co.id = ANY(${communityIds})`;

  await prisma.$executeRaw`
    UPDATE users u SET karma =
      COALESCE((SELECT SUM(score) FROM posts p
        WHERE p.author_id = u.id AND p.is_deleted = false), 0)
      + COALESCE((SELECT SUM(score) FROM comments c
        WHERE c.author_id = u.id AND c.is_deleted = false), 0)
    WHERE u.id = ANY(${userIds})`;
}

async function printSummary(prisma: PrismaClient): Promise<void> {
  const [
    users,
    communities,
    members,
    posts,
    comments,
    postVotes,
    commentVotes,
    media,
    tokens,
    viewStats,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.community.count(),
    prisma.communityMember.count(),
    prisma.post.count(),
    prisma.comment.count(),
    prisma.postVote.count(),
    prisma.commentVote.count(),
    prisma.media.count(),
    prisma.refreshToken.count(),
    prisma.postViewStat.count(),
  ]);

  console.table({
    users,
    communities,
    community_members: members,
    posts,
    comments,
    post_votes: postVotes,
    comment_votes: commentVotes,
    media,
    refresh_tokens: tokens,
    post_view_stats: viewStats,
  });
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is "production".');
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const ctx: SeedContext = {
    prisma,
    now: new Date(),
    userIds: new Map(),
    communityIds: new Map(),
    postIds: new Map(),
    commentIds: [],
  };

  const steps: [string, (ctx: SeedContext) => Promise<void>][] = [
    ['users', seedUsers],
    ['communities & members', seedCommunities],
    ['posts, comments & media', seedPosts],
    ['votes', seedVotes],
    ['refresh tokens', seedRefreshTokens],
    ['post reach history', seedPostInsights],
    ['denormalized counters', syncCounters],
  ];

  try {
    for (const [label, step] of steps) {
      const startedAt = Date.now();
      await step(ctx);
      console.log(`✔ Seeded ${label} (${Date.now() - startedAt}ms)`);
    }
    await printSummary(prisma);
    console.log(
      `Seed complete. All seeded users share the password "${process.env.SEED_USER_PASSWORD ? '$SEED_USER_PASSWORD' : DEFAULT_PASSWORD}".`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('✖ Seed failed:', error);
  process.exitCode = 1;
});
