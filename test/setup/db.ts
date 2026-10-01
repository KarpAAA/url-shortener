import { randomBytes } from 'node:crypto';

import { Client } from 'pg';
import { inject } from 'vitest';

import { TEMPLATE_DATABASE } from './constants';

export interface TestDatabase {
  readonly name: string;
  readonly url: string;
  /** A raw connection for assertions and for statements the application never issues. */
  query<TRow extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<TRow[]>;
  /** Kills every connection to the database, as a database outage would. */
  terminateConnections(): Promise<void>;
  drop(): Promise<void>;
}

const urlFor = (database: string): string => {
  const url = new URL(inject('postgresAdminUrl'));
  url.pathname = `/${database}`;
  return url.href;
};

const withAdmin = async <T>(run: (admin: Client) => Promise<T>): Promise<T> => {
  const admin = new Client({ connectionString: inject('postgresAdminUrl') });
  await admin.connect();
  try {
    return await run(admin);
  } finally {
    await admin.end();
  }
};

/**
 * A database of its own for one test file. `template: 'migrated'` clones the migrated and
 * seeded template; `'empty'` creates a blank database (for the migration tests).
 */
export async function createTestDatabase(
  template: 'migrated' | 'empty' = 'migrated',
): Promise<TestDatabase> {
  const name = `test_${randomBytes(6).toString('hex')}`;
  const from = template === 'migrated' ? ` TEMPLATE ${TEMPLATE_DATABASE}` : '';
  await withAdmin((admin) => admin.query(`CREATE DATABASE ${name}${from}`));
  const url = urlFor(name);

  const terminateConnections = (): Promise<void> =>
    withAdmin(async (admin) => {
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [name],
      );
    });

  return {
    name,
    url,
    async query<TRow extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        return (await client.query<TRow>(sql, params)).rows;
      } finally {
        await client.end();
      }
    },
    terminateConnections,
    async drop() {
      await withAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
    },
  };
}
