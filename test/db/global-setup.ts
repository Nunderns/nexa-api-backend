import { PGlite, type Extension } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'prisma', 'migrations');

// tsconfig's `moduleResolution: node` ignores package `exports`, so this
// subpath has no types under tsc; Node resolves it at runtime regardless.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { unaccent } = require('@electric-sql/pglite/contrib/unaccent') as {
  unaccent: Extension;
};

declare global {
  var __PGLITE_SERVER__: PGLiteSocketServer | undefined;
  var __PGLITE_DB__: PGlite | undefined;
}

export default async function globalSetup(): Promise<void> {
  // The full-text search migration needs unaccent.
  const db = await PGlite.create({ extensions: { unaccent } });

  // The real migration history, in order: this is what proves the
  // migrations apply cleanly on top of each other.
  const migrations = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const name of migrations) {
    await db.exec(
      readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8'),
    );
  }

  const server = new PGLiteSocketServer({
    db,
    host: '127.0.0.1',
    port: 0,
    // The default is a single connection. Each test app opens its own
    // one-connection pool, and the previous app's connection may still be
    // closing when the next one connects.
    maxConnections: 8,
  });
  await server.start();

  const url = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
  process.env.TEST_DATABASE_URL = url;

  await assertNoSchemaDrift(url);

  globalThis.__PGLITE_SERVER__ = server;
  globalThis.__PGLITE_DB__ = db;
}

/**
 * Fail if prisma/migrations does not produce exactly schema.prisma, so a
 * schema change can never ship without its migration.
 */
async function assertNoSchemaDrift(url: string): Promise<void> {
  // Async on purpose: this process also serves the database, so a blocking
  // call would leave the Prisma CLI unable to connect.
  const { stdout: script } = await promisify(execFile)(
    process.execPath,
    [
      require.resolve('prisma/build/index.js'),
      'migrate',
      'diff',
      '--config',
      join(__dirname, 'prisma.test.config.ts'),
      '--from-config-datasource',
      '--to-schema',
      join(ROOT, 'prisma', 'schema.prisma'),
      '--script',
    ],
    {
      cwd: __dirname,
      env: { ...process.env, TEST_DATABASE_URL: url },
      encoding: 'utf8',
    },
  );

  if (script.trim() && !script.includes('This is an empty migration')) {
    throw new Error(
      `prisma/migrations does not match schema.prisma. Missing changes:\n${script}`,
    );
  }
}
