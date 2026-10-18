import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Starts a throwaway PostgreSQL (PGlite, in-process WASM) for the e2e run and
 * exposes it over the wire protocol, so the app talks to it through its
 * normal `pg` driver adapter. Nothing outside this process is touched: no
 * Docker, no `DATABASE_URL`, no shared database.
 *
 * Runs here rather than inside a test file because PGlite loads its WASM with
 * a dynamic import, which Jest's module sandbox does not allow.
 */

const ROOT = join(__dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'prisma', 'migrations');

declare global {
  var __PGLITE_SERVER__: PGLiteSocketServer | undefined;
  var __PGLITE_DB__: PGlite | undefined;
}

export default async function globalSetup(): Promise<void> {
  const db = await PGlite.create();

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

  await healSchemaDrift(url);

  globalThis.__PGLITE_SERVER__ = server;
  globalThis.__PGLITE_DB__ = db;
}

/**
 * The schema has columns that predate any migration (email verification and
 * password reset were applied without one). Bring the test database up to
 * the schema so the app can run, but fail loudly if the gap ever involves
 * the notification tables: those must be fully covered by migrations.
 */
async function healSchemaDrift(url: string): Promise<void> {
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

  if (/notification/i.test(script)) {
    throw new Error(
      'prisma/migrations does not match schema.prisma for the notification ' +
        `tables. Missing changes:\n${script}`,
    );
  }

  if (script.trim() && !script.includes('This is an empty migration')) {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      await client.query(script);
    } finally {
      await client.end();
    }
  }
}
