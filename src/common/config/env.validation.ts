import { z } from 'zod';

const MIN_PRODUCTION_SECRET_LENGTH = 32;

const secret = z.string().trim().min(1, 'is required');

/**
 * Environment variables the app cannot run without.
 *
 * Validated once at boot by ConfigModule, so a missing secret stops the
 * process instead of silently falling back to a value that is public in the
 * source code (anyone could then sign valid JWTs).
 */
const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    DATABASE_URL: z.string().trim().min(1, 'is required'),
    JWT_SECRET: secret,
    JWT_REFRESH_SECRET: secret,
    FRONTEND_URL: z.string().trim().optional(),
  })
  .superRefine((env, ctx) => {
    for (const origin of env.FRONTEND_URL?.split(',') ?? []) {
      if (origin.trim() && !isHttpOrigin(origin.trim())) {
        ctx.addIssue({
          code: 'custom',
          path: ['FRONTEND_URL'],
          message: `"${origin.trim()}" is not an http(s) origin`,
        });
      }
    }

    if (env.NODE_ENV !== 'production') return;

    // Without it CORS would fall back to the local dev server.
    if (!env.FRONTEND_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['FRONTEND_URL'],
        message: 'is required in production',
      });
    }

    for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (env[key].length < MIN_PRODUCTION_SECRET_LENGTH) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production`,
        });
      }
    }

    // With a shared secret an access token would pass refresh verification
    // and vice versa.
    if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'must differ from JWT_SECRET',
      });
    }
  });

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      /^\/*$/.test(url.pathname) &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export type Env = z.infer<typeof envSchema>;

/**
 * `validate` hook for ConfigModule.forRoot. Keeps every other variable
 * untouched so code still reading `process.env` directly is unaffected.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  return { ...config, ...result.data };
}
