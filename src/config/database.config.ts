import { type ConfigType, registerAs } from '@nestjs/config';

import { env } from './env';

const STATEMENT_TIMEOUT_MS = 30_000; // db-general.md §9: a runaway query must not hold a connection

export const databaseConfig = registerAs('database', () => ({
  url: env().DATABASE_URL,
  /** Connections per instance; the sum over instances stays below Postgres `max_connections`. */
  poolSize: env().DATABASE_POOL_SIZE,
  statementTimeoutMs: STATEMENT_TIMEOUT_MS,
}));

export type DatabaseConfig = ConfigType<typeof databaseConfig>;
