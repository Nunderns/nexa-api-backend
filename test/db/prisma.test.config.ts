import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI config used only by the e2e global setup, pointed at the
 * throwaway in-process database. Never at `DATABASE_URL`.
 */
export default defineConfig({
  schema: '../../prisma/schema.prisma',
  datasource: { url: process.env.TEST_DATABASE_URL ?? '' },
});
