import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { LinkNotFoundError, ShortCodeTakenError } from '../../src/modules/links/domain/errors';
import { OriginalUrl } from '../../src/modules/links/domain/original-url';
import { ShortCode } from '../../src/modules/links/domain/short-code';
import { ShortLink } from '../../src/modules/links/domain/short-link';
import { InMemoryLinkRepository } from '../../src/modules/links/infrastructure/in-memory-link.repository';
import { PrismaLinkRepository } from '../../src/modules/links/infrastructure/prisma-link.repository';
import { createTestDatabase, type TestDatabase } from '../setup/db';

import type { LinkRepository } from '../../src/modules/links/ports/link-repository.port';

const NOW = new Date('2026-03-01T12:00:00.000Z');
const CONCURRENCY = 250;

const aLink = (code: string, url = 'https://example.com/target'): ShortLink =>
  ShortLink.shorten({
    code: ShortCode.parse(code),
    originalUrl: OriginalUrl.parse(url, { ownHosts: [] }),
    now: NOW,
  });

const connect = (url: string, poolSize = 5): PrismaService =>
  new PrismaService({ url, poolSize, statementTimeoutMs: 30_000 });

let db: TestDatabase;
let prisma: PrismaService;
let secondInstance: PrismaService;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = connect(db.url);
  secondInstance = connect(db.url);
});

afterAll(async () => {
  await prisma.$disconnect();
  await secondInstance.$disconnect();
  await db.drop();
});

const row = async (code: string): Promise<Record<string, unknown> | undefined> =>
  (await db.query('SELECT * FROM links WHERE code = $1', [code]))[0];

// The fake runs through the same expectations as the real adapter, so it cannot drift.
describe.each<[string, () => LinkRepository]>([
  ['PrismaLinkRepository', () => new PrismaLinkRepository(prisma)],
  ['InMemoryLinkRepository', () => new InMemoryLinkRepository()],
])('LinkRepository contract — %s', (name, create) => {
  const code = (suffix: string): string => (name.startsWith('Prisma') ? 'pr' : 'me') + suffix;

  it('R-17 rejects a second link with the same code', async () => {
    const links = create();
    await links.insert(aLink(code('Dup01'), 'https://example.com/first'));

    await expect(
      links.insert(aLink(code('Dup01'), 'https://example.com/second')),
    ).rejects.toBeInstanceOf(ShortCodeTakenError);
  });

  it('R-17 keeps the first link when the second is rejected', async () => {
    const links = create();
    await links.insert(aLink(code('Dup02'), 'https://example.com/first'));
    await links.insert(aLink(code('Dup02'), 'https://example.com/second')).catch(() => undefined);

    const url = await links.registerVisit(ShortCode.parse(code('Dup02')), NOW);

    expect(url.href).toBe('https://example.com/first');
  });

  it('R-21 returns the destination when a visit is registered', async () => {
    const links = create();
    await links.insert(aLink(code('Vis01'), 'https://example.com/a?b=c#d'));

    const url = await links.registerVisit(ShortCode.parse(code('Vis01')), NOW);

    expect(url).toBeInstanceOf(OriginalUrl);
    expect(url.href).toBe('https://example.com/a?b=c#d');
  });

  it('R-23 reports an unknown code as not found', async () => {
    await expect(create().registerVisit(ShortCode.parse('nope000'), NOW)).rejects.toBeInstanceOf(
      LinkNotFoundError,
    );
  });

  it('R-17 treats codes as case-sensitive', async () => {
    const links = create();
    await links.insert(aLink(code('CaseA'), 'https://example.com/upper'));
    await links.insert(aLink(code('casea'), 'https://example.com/lower'));

    const upper = await links.registerVisit(ShortCode.parse(code('CaseA')), NOW);
    const lower = await links.registerVisit(ShortCode.parse(code('casea')), NOW);

    expect([upper.href, lower.href]).toEqual([
      'https://example.com/upper',
      'https://example.com/lower',
    ]);
  });
});

describe('PrismaLinkRepository', () => {
  it('R-01 stores the link exactly as the domain created it', async () => {
    const link = aLink('store01');

    await new PrismaLinkRepository(prisma).insert(link);

    expect(await row('store01')).toMatchObject({
      id: link.id,
      code: 'store01',
      original_url: 'https://example.com/target',
      visits: '0',
      created_at: NOW,
      last_visited_at: null,
    });
  });

  it('R-26 a visit adds one, sets last_visited_at and leaves everything else alone', async () => {
    const links = new PrismaLinkRepository(prisma);
    const link = aLink('visit01');
    await links.insert(link);
    const visitedAt = new Date('2026-03-02T08:00:00.000Z');

    await links.registerVisit(link.code, visitedAt);

    expect(await row('visit01')).toMatchObject({
      id: link.id,
      original_url: 'https://example.com/target',
      visits: '1',
      created_at: NOW,
      last_visited_at: visitedAt,
    });
  });

  it('R-17 of many concurrent inserts of one code exactly one wins', async () => {
    const links = new PrismaLinkRepository(prisma);

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, (_, i) =>
        links.insert(aLink('race001', `https://example.com/${i}`)),
      ),
    );

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(99);
    expect(rejected.every((r) => r.reason instanceof ShortCodeTakenError)).toBe(true);
    expect(await db.query('SELECT 1 FROM links WHERE code = $1', ['race001'])).toHaveLength(1);
  });

  it(`R-27 ${CONCURRENCY} concurrent visits of one link are all counted`, async () => {
    const links = new PrismaLinkRepository(prisma);
    const link = aLink('hot0001');
    await links.insert(link);

    const urls = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => links.registerVisit(link.code, NOW)),
    );

    expect(urls.every((url) => url.href === 'https://example.com/target')).toBe(true);
    expect((await row('hot0001'))?.visits).toBe(String(CONCURRENCY));
  });

  it('R-27 concurrent visits through two application instances lose no update', async () => {
    const first = new PrismaLinkRepository(prisma);
    const second = new PrismaLinkRepository(secondInstance);
    const link = aLink('hot0002');
    await first.insert(link);

    await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        (i % 2 === 0 ? first : second).registerVisit(link.code, NOW),
      ),
    );

    expect((await row('hot0002'))?.visits).toBe(String(CONCURRENCY));
  });

  it('R-27 concurrent visits of different links do not leak into each other', async () => {
    const links = new PrismaLinkRepository(prisma);
    const a = aLink('hot000A');
    const b = aLink('hot000B');
    await links.insert(a);
    await links.insert(b);

    await Promise.all([
      ...Array.from({ length: 70 }, () => links.registerVisit(a.code, NOW)),
      ...Array.from({ length: 30 }, () => links.registerVisit(b.code, NOW)),
    ]);

    expect((await row('hot000A'))?.visits).toBe('70');
    expect((await row('hot000B'))?.visits).toBe('30');
  });
});

describe('database constraints', () => {
  const insertRaw = (overrides: Record<string, unknown>): Promise<unknown> => {
    const values = {
      id: '0194a1b2-c3d4-7e5f-8a6b-00000000c001',
      code: 'check01',
      original_url: 'https://example.com/',
      visits: 0,
      ...overrides,
    };
    return db.query(
      `INSERT INTO links (id, code, original_url, visits, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())`,
      [values.id, values.code, values.original_url, values.visits],
    );
  };

  it('R-17 the unique index on code holds for writes that bypass the application', async () => {
    await insertRaw({ id: '0194a1b2-c3d4-7e5f-8a6b-00000000c010', code: 'uniq001' });

    await expect(
      insertRaw({ id: '0194a1b2-c3d4-7e5f-8a6b-00000000c011', code: 'uniq001' }),
    ).rejects.toMatchObject({ code: '23505', constraint: 'links_code_key' });
  });

  it.each([
    ['too short', 'abc'],
    ['too long', 'abcdefgh'],
    ['with a forbidden character', 'abc-123'],
    ['empty', ''],
  ])('R-46 rejects a code that is %s', async (_name, code) => {
    await expect(insertRaw({ code })).rejects.toMatchObject({
      code: '23514',
      constraint: 'links_code_format_check',
    });
  });

  it('R-46 rejects a negative visit count', async () => {
    await expect(insertRaw({ visits: -1 })).rejects.toMatchObject({
      code: '23514',
      constraint: 'links_visits_non_negative_check',
    });
  });

  it.each([
    ['empty', ''],
    ['longer than 2048 characters', `https://example.com/${'a'.repeat(2048)}`],
  ])('R-46 rejects an original URL that is %s', async (_name, originalUrl) => {
    await expect(insertRaw({ original_url: originalUrl })).rejects.toMatchObject({
      code: '23514',
      constraint: 'links_original_url_length_check',
    });
  });

  it('R-46 refuses to store a link without a code or a URL', async () => {
    await expect(insertRaw({ code: null })).rejects.toMatchObject({ code: '23502' });
    await expect(insertRaw({ original_url: null })).rejects.toMatchObject({ code: '23502' });
  });
});
