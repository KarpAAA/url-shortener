import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expectProblem } from '../helpers/problem';
import { LINK_FRESH } from '../seed/ids';
import { createTestApp, type TestApp } from '../setup/app';

const LIMIT = 3;

let ctx: TestApp;

beforeAll(async () => {
  ctx = await createTestApp({
    env: { SHORTEN_RATE_LIMIT: String(LIMIT), SHORTEN_RATE_TTL_SECONDS: '60' },
  });
});

afterAll(async () => {
  await ctx.close();
});

const shorten = () => ctx.http.post('/shorten').send({ url: 'https://example.com/limited' });

describe('rate limit on POST /shorten', () => {
  it('R-34 accepts requests up to the limit, then answers 429 with Retry-After', async () => {
    for (let i = 0; i < LIMIT; i++) await shorten().expect(201);

    const res = await shorten();

    expectProblem(res, { status: 429, code: 'RATE_LIMITED', instance: '/shorten' });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(60);
  });

  it('R-34 a rejected request creates no link', async () => {
    const [before] = await ctx.db.query<{ count: string }>('SELECT count(*) FROM links');

    await shorten().expect(429);

    const [after] = await ctx.db.query<{ count: string }>('SELECT count(*) FROM links');
    expect(after?.count).toBe(before?.count);
  });

  it('R-34 counts rejected-by-validation requests too: the limit is on attempts', async () => {
    const res = await ctx.http.post('/shorten').send({ url: 42 });

    expect(res.status).toBe(429);
  });

  it('R-34 does not limit redirects', async () => {
    for (let i = 0; i < LIMIT * 3; i++) await ctx.http.get(`/${LINK_FRESH.code}`).expect(302);
  });

  it('R-34 does not limit statistics', async () => {
    for (let i = 0; i < LIMIT * 3; i++) {
      await ctx.http.get(`/stats/${LINK_FRESH.code}`).expect(200);
    }
  });
});
