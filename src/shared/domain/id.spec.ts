import { describe, expect, it } from 'vitest';

import { newId } from './id';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INSTANT = Date.parse('2026-01-01T00:00:00.000Z');

describe('newId', () => {
  it('produces an RFC 9562 version 7 UUID', () => {
    expect(newId()).toMatch(UUID_V7);
  });

  it('encodes the timestamp in the first 48 bits so ids sort by creation time', () => {
    const earlier = newId(INSTANT);
    const later = newId(INSTANT + 1);

    expect(parseInt(earlier.replace(/-/g, '').slice(0, 12), 16)).toBe(INSTANT);
    expect(earlier.slice(0, 13) < later.slice(0, 13)).toBe(true);
  });

  it('does not repeat within the same millisecond', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId(INSTANT)));

    expect(ids.size).toBe(1000);
  });
});
