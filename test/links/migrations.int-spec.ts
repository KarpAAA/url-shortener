import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from '../setup/db';
import { runPrisma } from '../setup/prisma-cli';

const MIGRATIONS_DIR = resolve(__dirname, '../../prisma/migrations');
const migrationNames = (): string[] =>
  readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase('empty');
});

afterAll(async () => {
  await db.drop();
});

describe('migrations', () => {
  it('R-45 apply from scratch on an empty database', async () => {
    const run = await runPrisma(['migrate', 'deploy'], db.url);

    expect(run.exitCode, run.output).toBe(0);
    const applied = await db.query<{ migration_name: string; finished: boolean }>(
      `SELECT migration_name, finished_at IS NOT NULL AND rolled_back_at IS NULL AS finished
       FROM _prisma_migrations ORDER BY migration_name`,
    );
    expect(applied.map((m) => m.migration_name)).toEqual(migrationNames());
    expect(applied.every((m) => m.finished)).toBe(true);
  });

  it('R-45 leave the database identical to the Prisma schema (no drift)', async () => {
    const run = await runPrisma(
      [
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      db.url,
    );

    // exit code 2 = the schema has changes no migration carries
    expect(run.exitCode, run.output).toBe(0);
  });

  it('R-45 are a no-op when applied a second time', async () => {
    const run = await runPrisma(['migrate', 'deploy'], db.url);

    expect(run.exitCode, run.output).toBe(0);
    expect(run.output).toMatch(/No pending migrations/);
  });

  it('R-17 R-45 create the unique index that code lookups and collision detection rely on', async () => {
    const indexes = await db.query<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'links' ORDER BY indexname",
    );

    expect(indexes).toEqual([
      {
        indexname: 'links_code_key',
        indexdef: 'CREATE UNIQUE INDEX links_code_key ON public.links USING btree (code)',
      },
      {
        indexname: 'links_pkey',
        indexdef: 'CREATE UNIQUE INDEX links_pkey ON public.links USING btree (id)',
      },
    ]);
  });

  it('R-45 a lookup by code uses the unique index, not a sequential scan', async () => {
    await db.query(
      `INSERT INTO links (id, code, original_url, created_at, updated_at)
       SELECT gen_random_uuid(), lpad(i::text, 7, '0'), 'https://example.com/' || i, now(), now()
       FROM generate_series(1, 5000) AS i`,
    );
    await db.query('ANALYZE links');

    const plan = await db.query<{ 'QUERY PLAN': string }>(
      "EXPLAIN UPDATE links SET visits = visits + 1 WHERE code = '0002500' RETURNING original_url",
    );
    const text = plan.map((line) => line['QUERY PLAN']).join('\n');

    expect(text).toMatch(/Index Scan using links_code_key/);
    expect(text).not.toMatch(/Seq Scan/);
  });

  it('R-45 store every point in time as timestamptz', async () => {
    const columns = await db.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'links' AND column_name LIKE '%_at' ORDER BY column_name`,
    );

    expect(columns).toEqual([
      { column_name: 'created_at', data_type: 'timestamp with time zone' },
      { column_name: 'last_visited_at', data_type: 'timestamp with time zone' },
      { column_name: 'updated_at', data_type: 'timestamp with time zone' },
    ]);
  });
});
