import { setTimeout as sleep } from 'node:timers/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Database, DB_READ } from '../../src/infrastructure/database/database.module';
import { ShutdownState } from '../../src/infrastructure/health/shutdown-state';
import { LINK_SETTINGS, type LinkSettings } from '../../src/modules/links/domain/link-settings';
import { LinksQueryService } from '../../src/modules/links/read/links.query.service';
import { LINK_VISITED } from '../seed/ids';
import { createTestApp, type TestApp } from '../setup/app';

import type { LinkStatsDto } from '../../src/modules/links/read/dto/link-stats.dto';
import type { AddressInfo } from 'node:net';

const HANDLER_DELAY_MS = 400;

/** Statistics that take a while: the request is still in flight when shutdown begins. */
class SlowLinksQueryService extends LinksQueryService {
  override async getStats(code: string): Promise<LinkStatsDto> {
    await sleep(HANDLER_DELAY_MS);
    return super.getStats(code); // needs the database *after* shutdown has started
  }
}

let ctx: TestApp;
let baseUrl: string;

beforeAll(async () => {
  ctx = await createTestApp({
    override: (builder) =>
      builder.overrideProvider(LinksQueryService).useFactory({
        inject: [DB_READ, LINK_SETTINGS],
        factory: (db: Database, settings: LinkSettings) => new SlowLinksQueryService(db, settings),
      }),
  });
  const { port } = ctx.app.getHttpServer().address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await ctx.db.drop();
});

describe('graceful shutdown', () => {
  it('R-44 drains an in-flight request, then stops accepting and releases the database', async () => {
    const shutdown = ctx.app.get(ShutdownState);
    const inFlight = fetch(`${baseUrl}/stats/${LINK_VISITED.code}`);
    await sleep(HANDLER_DELAY_MS / 4); // the request has reached the handler

    const closed = ctx.app.close();
    await sleep(HANDLER_DELAY_MS / 4);

    // shutdown has begun, the request is still being served
    expect(shutdown.isShuttingDown).toBe(true);

    const res = await inFlight;
    expect(res.status).toBe(200);
    expect(((await res.json()) as LinkStatsDto).code).toBe(LINK_VISITED.code);

    await closed;
    await expect(fetch(`${baseUrl}/health/live`)).rejects.toThrow();
    const connections = await ctx.db.query<{ count: string }>(
      `SELECT count(*) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [ctx.db.name],
    );
    expect(connections[0]?.count).toBe('0');
  });
});
