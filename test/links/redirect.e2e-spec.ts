import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expectProblem } from '../helpers/problem';
import { LINK_FRESH, LINK_VISITED, UNKNOWN_CODE } from '../seed/ids';
import { createTestApp, type TestApp } from '../setup/app';

let ctx: TestApp;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

const visitsOf = async (code: string): Promise<{ visits: number; lastVisitedAt: Date | null }> => {
  const [row] = await ctx.db.query<{ visits: string; last_visited_at: Date | null }>(
    'SELECT visits, last_visited_at FROM links WHERE code = $1',
    [code],
  );
  return { visits: Number(row?.visits), lastVisitedAt: row?.last_visited_at ?? null };
};

const countLinks = async (): Promise<number> => {
  const [row] = await ctx.db.query<{ count: string }>('SELECT count(*) FROM links');
  return Number(row?.count);
};

describe('GET /:code', () => {
  it('R-21 redirects an existing code to its original URL with 302', async () => {
    const res = await ctx.http.get(`/${LINK_FRESH.code}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(LINK_FRESH.originalUrl);
  });

  it('R-22 forbids caching the redirect, so every visit reaches the server', async () => {
    const res = await ctx.http.get(`/${LINK_VISITED.code}`).expect(302);

    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('R-26 counts each successful redirect and records when it happened', async () => {
    const before = await visitsOf(LINK_VISITED.code);
    const startedAt = Date.now();

    await ctx.http.get(`/${LINK_VISITED.code}`).expect(302);
    await ctx.http.get(`/${LINK_VISITED.code}`).expect(302);
    await ctx.http.get(`/${LINK_VISITED.code}`).expect(302);

    const after = await visitsOf(LINK_VISITED.code);
    expect(after.visits).toBe(before.visits + 3);
    expect(after.lastVisitedAt?.getTime()).toBeGreaterThanOrEqual(startedAt - 1000);
    expect(after.lastVisitedAt?.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('R-26 counts visits of one link without touching another', async () => {
    const other = await visitsOf(LINK_FRESH.code);

    await ctx.http.get(`/${LINK_VISITED.code}`).expect(302);

    expect(await visitsOf(LINK_FRESH.code)).toEqual(other);
  });

  it('R-20 a URL shortened through the API redirects back to exactly that URL', async () => {
    const url = 'https://example.com/a/b?x=1&y=%20space#section';
    const created = await ctx.http.post('/shorten').send({ url }).expect(201);
    const { code } = created.body as { code: string };

    const res = await ctx.http.get(`/${code}`).expect(302);

    expect(res.headers.location).toBe(url);
  });

  it('R-20 an IDN URL redirects to its normalised ASCII form', async () => {
    const created = await ctx.http
      .post('/shorten')
      .send({ url: 'https://приклад.укр/шлях' })
      .expect(201);
    const { code, originalUrl } = created.body as { code: string; originalUrl: string };

    const res = await ctx.http.get(`/${code}`).expect(302);

    expect(res.headers.location).toBe(originalUrl);

    expect(res.headers.location).toMatch(/^[\x00-\x7F]+$/);
  });

  it('R-23 answers 404 problem+json to a code nobody issued', async () => {
    expectProblem(await ctx.http.get(`/${UNKNOWN_CODE}`), {
      status: 404,
      code: 'LINK_NOT_FOUND',
      instance: `/${UNKNOWN_CODE}`,
      detail: 'Short link not found',
    });
  });

  it('R-23 does not create or count anything for an unknown code', async () => {
    const before = await countLinks();

    await ctx.http.get(`/${UNKNOWN_CODE}`).expect(404);

    expect(await countLinks()).toBe(before);
  });

  it.each([
    ['too short', '/abc123'],
    ['too long', '/abc12345'],
    ['with a dash', '/abc-123'],
    ['with an underscore', '/abc_123'],
    ['with a dot', '/abc.123'],
    ['with a percent-encoded space', '/abc%20123'],
    ['with a non-ASCII letter', `/${encodeURIComponent('abcд123')}`],
    ['a single character', '/a'],
  ])('R-24 answers 404 to a code that is %s', async (_name, path) => {
    expectProblem(await ctx.http.get(path), {
      status: 404,
      code: 'LINK_NOT_FOUND',
      instance: path,
    });
  });

  it.each([
    ['shorten', '/shorten', 405],
    ['SHORTEN', '/SHORTEN', 405],
    ['metrics', '/metrics', 404],
    ['METRICS', '/METRICS', 404],
  ])('R-25 never treats the reserved word %s as a code', async (_name, path, status) => {
    const res = await ctx.http.get(path);

    expect(res.status).toBe(status);
    expect(res.headers.location).toBeUndefined();
  });

  it('R-25 a link stored under a reserved word would still not be served', async () => {
    // only possible by bypassing the application: the route guard is independent of the data
    await ctx.db.query(
      `INSERT INTO links (id, code, original_url, created_at, updated_at)
       VALUES ('0194a1b2-c3d4-7e5f-8a6b-0000000000ff', 'metrics', 'https://evil.example/', now(), now())`,
    );

    const res = await ctx.http.get('/metrics');

    expect(res.status).toBe(404);
    expect(res.headers.location).toBeUndefined();
  });

  it.each([
    ['liveness', '/health/live', 200, /^application\/json/],
    ['readiness', '/health/ready', 200, /^application\/json/],
    ['the OpenAPI document', '/docs-json', 200, /^application\/json/],
    ['Swagger UI', '/docs', 200, /^text\/html/],
    ['statistics', `/stats/${LINK_FRESH.code}`, 200, /^application\/json/],
  ])('R-25 does not intercept %s', async (_name, path, status, contentType) => {
    const res = await ctx.http.get(path);

    expect(res.status).toBe(status);
    expect(res.headers['content-type']).toMatch(contentType);
    expect(res.headers.location).toBeUndefined();
  });

  it('R-24 answers 400 problem+json to a path that is not valid percent-encoding', async () => {
    expectProblem(await ctx.http.get('/%E0%A4%A'), {
      status: 400,
      code: 'BAD_REQUEST',
      instance: '/%E0%A4%A',
    });
  });

  it('R-21 answers a HEAD request like a GET, without a body', async () => {
    const res = await ctx.http.head(`/${LINK_FRESH.code}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(LINK_FRESH.originalUrl);
  });
});
