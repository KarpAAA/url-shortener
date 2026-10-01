import { describe, expect, it } from 'vitest';

import { aCode, aShortLink, aUrl, NOW } from './__test__/builders';
import { ShortLink } from './short-link';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('ShortLink.shorten', () => {
  it('R-01 creates a link with no visits, created at the given instant', () => {
    const link = ShortLink.shorten({ code: aCode(), originalUrl: aUrl(), now: NOW });

    expect(link.code.value).toBe('aB3xY9z');
    expect(link.originalUrl.href).toBe('https://example.com/some/page?x=1');
    expect(link.visits).toBe(0n);
    expect(link.createdAt).toEqual(NOW);
    expect(link.lastVisitedAt).toBeNull();
  });

  it('R-01 gives the link an application-generated UUID v7', () => {
    const link = ShortLink.shorten({ code: aCode(), originalUrl: aUrl(), now: NOW });

    expect(link.id).toMatch(UUID_V7);
    expect(parseInt(link.id.replace(/-/g, '').slice(0, 12), 16)).toBe(NOW.getTime());
  });

  it('R-14 gives two links of the same URL different identities', () => {
    const first = ShortLink.shorten({ code: aCode('aaaaaa1'), originalUrl: aUrl(), now: NOW });
    const second = ShortLink.shorten({ code: aCode('aaaaaa2'), originalUrl: aUrl(), now: NOW });

    expect(first.id).not.toBe(second.id);
  });
});

describe('ShortLink.restore', () => {
  it('round-trips through snapshot without changing anything', () => {
    const visited = new Date('2026-02-01T08:30:00.000Z');
    const link = aShortLink({ visits: 42n, lastVisitedAt: visited });

    const restored = ShortLink.restore(link.snapshot());

    expect(restored.snapshot()).toEqual(link.snapshot());
    expect(restored.visits).toBe(42n);
    expect(restored.lastVisitedAt).toEqual(visited);
  });

  it('exposes a snapshot that cannot change the link', () => {
    const link = aShortLink({ visits: 1n });
    const snapshot = link.snapshot() as { visits: bigint };

    snapshot.visits = 999n;

    expect(link.visits).toBe(1n);
  });
});
