import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv as parseDotenv } from 'node:util';

import { describe, expect, it } from 'vitest';

import { envSchema, InvalidEnvError, parseEnv } from './env.schema';

const VALID = {
  NODE_ENV: 'production',
  PUBLIC_BASE_URL: 'https://sho.rt',
  DATABASE_URL: 'postgresql://user:pass@db:5432/app',
};

const readEnvFile = (name: string): Record<string, string | undefined> =>
  parseDotenv(readFileSync(resolve(__dirname, '../..', name), 'utf8'));

const problemsOf = (raw: Record<string, unknown>): string[] => {
  try {
    parseEnv(raw);
  } catch (err) {
    if (err instanceof InvalidEnvError) return err.problems.map((p) => p.split(':')[0] ?? '');
    throw err;
  }
  return [];
};

describe('environment configuration', () => {
  it('R-38 accepts a minimal valid environment and applies safe defaults', () => {
    expect(parseEnv(VALID)).toMatchObject({
      PORT: 3000,
      DATABASE_POOL_SIZE: 10,
      LOG_LEVEL: 'info',
      LOG_PRETTY: false,
      SHORTEN_RATE_LIMIT: 30,
      SHORTEN_RATE_TTL_SECONDS: 60,
      TRUST_PROXY_HOPS: 0,
      SHUTDOWN_TIMEOUT_MS: 10_000,
    });
  });

  it('R-38 refuses to start and names every invalid key at once', () => {
    const invalid = {
      NODE_ENV: 'staging',
      PORT: 'abc',
      PUBLIC_BASE_URL: 'ftp://x',
      LOG_LEVEL: 'loud',
    };

    expect(() => parseEnv(invalid)).toThrow(InvalidEnvError);
    expect(problemsOf(invalid).sort()).toEqual([
      'DATABASE_URL',
      'LOG_LEVEL',
      'NODE_ENV',
      'PORT',
      'PUBLIC_BASE_URL',
    ]);
  });

  it('R-38 has no default for the database URL or the public base URL', () => {
    expect(problemsOf({ NODE_ENV: 'production' }).sort()).toEqual([
      'DATABASE_URL',
      'PUBLIC_BASE_URL',
    ]);
  });

  it('R-38 rejects a database URL that is not postgresql', () => {
    expect(problemsOf({ ...VALID, DATABASE_URL: 'mysql://u:p@db/app' })).toEqual(['DATABASE_URL']);
  });

  it('R-38 reads LOG_PRETTY=false as false, not as a truthy string', () => {
    expect(parseEnv({ ...VALID, LOG_PRETTY: 'false' }).LOG_PRETTY).toBe(false);
    expect(parseEnv({ ...VALID, LOG_PRETTY: 'true' }).LOG_PRETTY).toBe(true);
  });

  it.each(['.env.example', '.env.test'])('R-39 %s declares exactly the schema keys', (file) => {
    expect(Object.keys(readEnvFile(file)).sort()).toEqual(Object.keys(envSchema.shape).sort());
  });

  it.each(['.env.example', '.env.test'])('R-39 %s holds values the schema accepts', (file) => {
    expect(() => parseEnv(readEnvFile(file))).not.toThrow();
  });
});
