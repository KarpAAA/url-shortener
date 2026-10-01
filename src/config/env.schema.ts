import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),

  PUBLIC_BASE_URL: z.url({ protocol: /^https?$/, error: 'must be an http(s) URL' }),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgresql:// URL' }),

  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_PRETTY: z.stringbool().default(false),

  SHORTEN_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  SHORTEN_RATE_TTL_SECONDS: z.coerce.number().int().positive().default(60),

  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'InvalidEnvError';
  }
}

/** Parses the raw environment or throws one error naming every failing key. */
export function parseEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;
  throw new InvalidEnvError(
    result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
  );
}
