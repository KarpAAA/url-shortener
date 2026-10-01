import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expectProblem } from '../helpers/problem';
import { LINK_FRESH, LINK_VISITED, UNKNOWN_CODE } from '../seed/ids';
import { createTestApp, type TestApp } from '../setup/app';

interface StatsBody {
  code: string;
  originalUrl: string;
  visits: number;
  createdAt: string;
  lastVisitedAt: string | null;
}

let ctx: TestApp;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

const stats = async (code: string): Promise<StatsBody> =>
  (await ctx.http.get(`/stats/${code}`).expect(200)).body as StatsBody;

describe('GET /stats/:code', () => {
  it('R-28 returns code, originalUrl, visits, createdAt and lastVisitedAt', async () => {
    const res = await ctx.http.get(`/stats/${LINK_VISITED.code}`).expect(200);

    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toEqual({
      code: LINK_VISITED.code,
      originalUrl: LINK_VISITED.originalUrl,
      visits: LINK_VISITED.visits,
      createdAt: LINK_VISITED.createdAt,
      lastVisitedAt: LINK_VISITED.lastVisitedAt,
    });
  });

  it('R-28 reports lastVisitedAt as null — present, not missing — before the first visit', async () => {
    const body = await stats(LINK_FRESH.code);

    expect(body.visits).toBe(0);
    expect(body).toHaveProperty('lastVisitedAt', null);
  });

  it('R-28 visits is a JSON number, not a string', async () => {
    expect(typeof (await stats(LINK_VISITED.code)).visits).toBe('number');
  });

  it('R-28 is not cached', async () => {
    const res = await ctx.http.get(`/stats/${LINK_VISITED.code}`).expect(200);

    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('R-29 reading statistics is not a visit', async () => {
    const before = await stats(LINK_VISITED.code);

    await stats(LINK_VISITED.code);
    await stats(LINK_VISITED.code);

    expect(await stats(LINK_VISITED.code)).toEqual(before);
  });

  it('R-26 R-28 reflects each redirect: the count grows by one and lastVisitedAt moves', async () => {
    const created = await ctx.http
      .post('/shorten')
      .send({ url: 'https://example.com/counted' })
      .expect(201);
    const { code, createdAt } = created.body as { code: string; createdAt: string };

    expect(await stats(code)).toMatchObject({ visits: 0, lastVisitedAt: null, createdAt });

    await ctx.http.get(`/${code}`).expect(302);
    const afterOne = await stats(code);
    await ctx.http.get(`/${code}`).expect(302);
    const afterTwo = await stats(code);

    expect(afterOne.visits).toBe(1);
    expect(afterTwo.visits).toBe(2);
    expect(Date.parse(afterOne.lastVisitedAt ?? '')).toBeGreaterThanOrEqual(Date.parse(createdAt));
    expect(Date.parse(afterTwo.lastVisitedAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse(afterOne.lastVisitedAt ?? ''),
    );
    expect(afterTwo.createdAt).toBe(createdAt);
  });

  it('R-02 the Location of a created link is its statistics resource', async () => {
    const created = await ctx.http
      .post('/shorten')
      .send({ url: 'https://example.com/located' })
      .expect(201);

    const res = await ctx.http.get(created.headers.location ?? '').expect(200);

    expect((res.body as StatsBody).code).toBe((created.body as { code: string }).code);
  });

  it('R-30 answers 404 problem+json to a code nobody issued', async () => {
    expectProblem(await ctx.http.get(`/stats/${UNKNOWN_CODE}`), {
      status: 404,
      code: 'LINK_NOT_FOUND',
      instance: `/stats/${UNKNOWN_CODE}`,
    });
  });

  it.each([
    ['too short', 'abc'],
    ['too long', 'abcdefgh12'],
    ['with a forbidden character', 'abc-123'],
    ['a reserved word', 'shorten'],
  ])('R-30 answers 404 to a code that is %s', async (_name, code) => {
    expectProblem(await ctx.http.get(`/stats/${code}`), {
      status: 404,
      code: 'LINK_NOT_FOUND',
      instance: `/stats/${code}`,
    });
  });

  it('R-30 answers 404 to the collection path itself', async () => {
    const res = await ctx.http.get('/stats');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  });
});
