import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ShutdownState } from '../../src/infrastructure/health/shutdown-state';
import { expectProblem } from '../helpers/problem';
import { createTestApp, type TestApp } from '../setup/app';

let ctx: TestApp;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

describe('health', () => {
  it('R-40 liveness answers 200 while the process runs', async () => {
    const res = await ctx.http.get('/health/live').expect(200);

    expect(res.body).toEqual({ status: 'ok' });
  });

  it('R-41 readiness answers 200 and names the checks while the database answers', async () => {
    const res = await ctx.http.get('/health/ready').expect(200);

    expect(res.body).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' }, accepting: { status: 'up' } },
    });
  });

  it('R-41 readiness answers 503 when the database is gone, and liveness stays 200', async () => {
    await ctx.db.query('SELECT 1');
    await ctx.db.drop();

    const ready = await ctx.http.get('/health/ready');
    const live = await ctx.http.get('/health/live');

    expectProblem(ready, { status: 503, code: 'SERVICE_UNAVAILABLE', instance: '/health/ready' });
    expect(live.status).toBe(200);
  });

  it('R-41 a request that needs the database fails as a 500 problem, not a crash', async () => {
    const res = await ctx.http.get('/stats/aB3xY9z');

    expectProblem(res, { status: 500, code: 'INTERNAL', instance: '/stats/aB3xY9z' });
  });

  it('R-44 readiness answers 503 once shutdown has begun', async () => {
    ctx.app.get(ShutdownState).onModuleDestroy();

    const res = await ctx.http.get('/health/ready');

    expectProblem(res, { status: 503, code: 'SERVICE_UNAVAILABLE', instance: '/health/ready' });
  });
});
