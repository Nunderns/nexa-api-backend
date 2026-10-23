import { Prisma } from '@prisma/client';

/** Prisma error code for a unique constraint violation (P2002). */
const UNIQUE_VIOLATION = 'P2002';

/**
 * Recognises a unique constraint violation. Prisma error internals are never
 * forwarded to the client; they are only used to pick the right response.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_VIOLATION
  );
}
