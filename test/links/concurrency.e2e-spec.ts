import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LINK_FRESH } from '../seed/ids';
import { createTestApp, type TestApp } from '../setup/app';

const PARALLEL = 150;

let ctx: TestApp;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

describe('concurrency through HTTP', () => {
  it(`R-27 ${PARALLEL} parallel redirects of one link are all counted in its statistics`, async () => {
    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, () => ctx.http.get(`/${LINK_FRESH.code}`)),
    );

    expect(responses.every((res) => res.status === 302)).toBe(true);
    const stats = await ctx.http.get(`/stats/${LINK_FRESH.code}`).expect(200);
    expect((stats.body as { visits: number }).visits).toBe(LINK_FRESH.visits + PARALLEL);
  });

  it('R-14 R-17 parallel requests to shorten the same URL each get a distinct code', async () => {
    const responses = await Promise.all(
      Array.from({ length: 60 }, () =>
        ctx.http.post('/shorten').send({ url: 'https://example.com/same' }),
      ),
    );

    expect(responses.every((res) => res.status === 201)).toBe(true);
    const codes = responses.map((res) => (res.body as { code: string }).code);
    expect(new Set(codes).size).toBe(60);
    const rows = await ctx.db.query('SELECT 1 FROM links WHERE original_url = $1', [
      'https://example.com/same',
    ]);
    expect(rows).toHaveLength(60);
  });
});
