import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Prisma client for the throwaway database started by `global-setup.ts`.
 *
 * Refuses to run against anything but the loopback server, so a test can
 * never reach a real database even if the environment is misconfigured.
 *
 * The pool holds a single connection: PGlite is one Postgres session, and
 * several wire connections would share it, interleaving their transactions.
 */
export function createTestPrisma(): PrismaService {
  const url = process.env.TEST_DATABASE_URL;

  if (!url || !url.includes('@127.0.0.1:')) {
    throw new Error(
      'TEST_DATABASE_URL is not the local test database; is the e2e global setup configured?',
    );
  }

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  // An idle connection dropped when the server stops must not crash Jest.
  pool.on('error', () => undefined);

  const client = new PrismaClient({ adapter: new PrismaPg(pool) });

  // `$disconnect` does not end a pool the caller created, so it is closed
  // here too. Same lifecycle hooks the app uses; cleanDatabase is unused.
  const disconnect = client.$disconnect.bind(client);
  let closed = false;
  const close = async () => {
    await disconnect();
    if (!closed) {
      closed = true;
      await pool.end();
    }
  };

  return Object.assign(client, {
    onModuleInit: () => client.$connect(),
    onModuleDestroy: close,
    $disconnect: close,
  }) as unknown as PrismaService;
}

/** Empties every application table between tests. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const tableList = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tableList} RESTART IDENTITY CASCADE`,
  );
}

let sequence = 0;

/** A verified, active user that the JWT strategy accepts. */
export function createUser(prisma: PrismaService, username: string) {
  sequence += 1;

  return prisma.user.create({
    data: {
      username,
      email: `${username}.${sequence}@example.com`,
      passwordHash: 'not-a-real-hash',
      displayName: username,
      isEmailVerified: true,
    },
  });
}

export async function createCommunity(
  prisma: PrismaService,
  ownerId: number,
  name: string,
  memberIds: number[] = [],
  isPrivate = false,
) {
  const community = await prisma.community.create({
    data: { name, displayName: name, createdBy: ownerId, isPrivate },
  });

  await prisma.communityMember.createMany({
    data: [
      { communityId: community.id, userId: ownerId, role: 'OWNER' as const },
      ...memberIds.map((userId) => ({
        communityId: community.id,
        userId,
        role: 'MEMBER' as const,
      })),
    ],
  });

  return community;
}

/** Polls until `check` returns a truthy value (async listeners settle). */
export async function waitFor<T>(
  check: () => Promise<T | null | undefined | false>,
  timeoutMs = 3_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const value = await check();

    if (value) {
      return value;
    }

    if (Date.now() > deadline) {
      throw new Error('waitFor timed out');
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
