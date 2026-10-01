import { Client } from 'pg';

import { SEED_LINKS } from './ids';

/** Inserts the fixed test rows; idempotent, so it can be re-run between `describe` blocks. */
export async function seedTestData(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const link of SEED_LINKS) {
      await client.query(
        `INSERT INTO links (id, code, original_url, visits, created_at, updated_at, last_visited_at)
         VALUES ($1, $2, $3, $4, $5, $5, $6)
         ON CONFLICT (id) DO UPDATE
           SET visits = EXCLUDED.visits, last_visited_at = EXCLUDED.last_visited_at`,
        [link.id, link.code, link.originalUrl, link.visits, link.createdAt, link.lastVisitedAt],
      );
    }
  } finally {
    await client.end();
  }
}
