import { type ConfigType, registerAs } from '@nestjs/config';

import { env } from './env';

const MS_PER_SECOND = 1000;

export const httpConfig = registerAs('http', () => ({
  /** security.md §1: an unlimited body is a one-request denial of service. */
  jsonBodyLimit: '10kb',
  shortenRateLimit: env().SHORTEN_RATE_LIMIT,
  shortenRateTtlMs: env().SHORTEN_RATE_TTL_SECONDS * MS_PER_SECOND,
}));

export type HttpConfig = ConfigType<typeof httpConfig>;
