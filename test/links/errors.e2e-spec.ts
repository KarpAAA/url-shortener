import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FakeCodeGenerator } from '../../src/modules/links/infrastructure/fake-code-generator.adapter';
import { CODE_GENERATOR } from '../../src/modules/links/ports/code-generator.port';
import { LinksQueryService } from '../../src/modules/links/read/links.query.service';
import { expectProblem } from '../helpers/problem';
import { LINK_FRESH } from '../seed/ids';
import { createTestApp, type TestApp } from '../setup/app';

const SECRET = 'connect ECONNREFUSED 10.0.0.5:5432 password=hunter2';

/** A generator that always proposes a code the seed already took. */
const alwaysColliding = new FakeCodeGenerator(Array.from({ length: 50 }, () => LINK_FRESH.code));

let ctx: TestApp;

beforeAll(async () => {
  ctx = await createTestApp({
    override: (builder) =>
      builder
        .overrideProvider(CODE_GENERATOR)
        .useValue(alwaysColliding)
        .overrideProvider(LinksQueryService)
        .useValue({
          getStats: () => Promise.reject(new Error(SECRET)),
          getShortLink: () => Promise.reject(new TypeError(SECRET)),
        }),
  });
});

afterAll(async () => {
  await ctx.close();
});

describe('error responses', () => {
  it('R-19 answers 503 with Retry-After when no unique code can be allocated', async () => {
    const before = alwaysColliding.generated;

    const res = await ctx.http.post('/shorten').send({ url: 'https://example.com/unlucky' });

    expectProblem(res, {
      status: 503,
      code: 'SHORT_CODE_ALLOCATION_FAILED',
      instance: '/shorten',
      detail: 'Service temporarily unavailable, retry later',
    });
    expect(res.headers['retry-after']).toBe('5');
    expect(alwaysColliding.generated - before).toBe(5);
  });

  it('R-19 leaves the colliding link untouched and stores nothing new', async () => {
    await ctx.http.post('/shorten').send({ url: 'https://example.com/unlucky' }).expect(503);

    const rows = await ctx.db.query('SELECT original_url FROM links WHERE code = $1', [
      LINK_FRESH.code,
    ]);
    const [total] = await ctx.db.query<{ count: string }>('SELECT count(*) FROM links');

    expect(rows).toEqual([{ original_url: LINK_FRESH.originalUrl }]);
    expect(total?.count).toBe('2');
  });

  it('R-32 answers 500 to an unexpected error without its message, type or stack', async () => {
    const res = await ctx.http.get(`/stats/${LINK_FRESH.code}`);

    expectProblem(res, {
      status: 500,
      code: 'INTERNAL',
      instance: `/stats/${LINK_FRESH.code}`,
      detail: 'An unexpected error occurred',
    });
    expect(res.text).not.toContain('hunter2');
    expect(res.text).not.toContain('ECONNREFUSED');
    expect(res.text).not.toMatch(/TypeError|stack|\.ts\b|\.js\b/);
  });

  it.each([
    ['GET', '/no/such/route'],
    ['GET', '/stats/aB3xY9z/extra'],
    ['GET', '/'],
    ['POST', '/'],
    ['GET', '/shorten/extra'],
    ['POST', '/health/live'],
  ])('R-33 answers %s %s with a 404 problem, not a framework default', async (method, path) => {
    const res = await ctx.http[method.toLowerCase() as 'get'](path);

    expectProblem(res, { status: 404, code: 'NOT_FOUND', instance: path });
  });

  it.each([
    ['GET', '/shorten', 'POST'],
    ['PUT', '/shorten', 'POST'],
    ['PATCH', '/shorten', 'POST'],
    ['DELETE', '/shorten', 'POST'],
    ['OPTIONS', '/shorten', 'POST'],
    ['POST', '/stats/aB3xY9z', 'GET, HEAD'],
    ['DELETE', '/stats/aB3xY9z', 'GET, HEAD'],
    ['POST', '/aB3xY9z', 'GET, HEAD'],
    ['PUT', '/aB3xY9z', 'GET, HEAD'],
    ['DELETE', '/aB3xY9z', 'GET, HEAD'],
  ])('R-49 answers %s %s with 405 and Allow: %s', async (method, path, allow) => {
    const res = await ctx.http[method.toLowerCase() as 'get'](path);

    expectProblem(res, { status: 405, code: 'METHOD_NOT_ALLOWED', instance: path });
    expect(res.headers.allow).toBe(allow);
  });

  it('R-49 a rejected method changes nothing: no link is deleted or visited', async () => {
    await ctx.http.delete(`/${LINK_FRESH.code}`).expect(405);
    await ctx.http.post(`/${LINK_FRESH.code}`).expect(405);

    const rows = await ctx.db.query('SELECT visits FROM links WHERE code = $1', [LINK_FRESH.code]);
    expect(rows).toEqual([{ visits: '0' }]);
  });

  it('R-35 returns a generated correlation id on a success response', async () => {
    const res = await ctx.http.get('/health/live').expect(200);

    expect(res.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('R-35 gives every request its own correlation id', async () => {
    const first = await ctx.http.get('/health/live');
    const second = await ctx.http.get('/health/live');

    expect(first.headers['x-correlation-id']).not.toBe(second.headers['x-correlation-id']);
  });

  it('R-35 echoes the correlation id the client sent, in the header and in the problem', async () => {
    const res = await ctx.http.get('/no/such/route').set('x-correlation-id', 'client-trace.42_A');

    expect(res.headers['x-correlation-id']).toBe('client-trace.42_A');
    expect((res.body as { correlationId: string }).correlationId).toBe('client-trace.42_A');
  });

  it.each([
    ['contains spaces and markup', 'abc <script>'],
    ['is longer than 128 characters', 'a'.repeat(129)],
    ['is empty', ''],
  ])('R-35 replaces a client correlation id that %s', async (_name, supplied) => {
    const res = await ctx.http.get('/health/live').set('x-correlation-id', supplied);

    expect(res.headers['x-correlation-id']).not.toBe(supplied);
    expect(res.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('R-35 carries a correlation id even when the body cannot be parsed', async () => {
    const res = await ctx.http
      .post('/shorten')
      .set('Content-Type', 'application/json')
      .set('x-correlation-id', 'broken-body-1')
      .send('{"url":');

    expectProblem(res, { status: 400, code: 'MALFORMED_JSON', instance: '/shorten' });
    expect(res.headers['x-correlation-id']).toBe('broken-body-1');
  });

  it('R-31 marks error responses as not cacheable', async () => {
    const res = await ctx.http.get('/no/such/route');

    expect(res.headers['cache-control']).toBe('no-store');
  });
});
