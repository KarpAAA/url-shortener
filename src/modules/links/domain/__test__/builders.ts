import fc from 'fast-check';

import { OriginalUrl, type UrlRules } from '../original-url';
import { CODE_ALPHABET, CODE_LENGTH, type RandomIndex, ShortCode } from '../short-code';
import { ShortLink, type ShortLinkProps } from '../short-link';

export const NO_OWN_HOSTS: UrlRules = { ownHosts: [] };
export const OWN_HOST_RULES: UrlRules = { ownHosts: ['sho.rt', 'localhost:3000'] };

export const NOW = new Date('2026-01-15T10:00:00.000Z');

export const aCode = (value = 'aB3xY9z'): ShortCode => ShortCode.parse(value);

export const aUrl = (value = 'https://example.com/some/page?x=1'): OriginalUrl =>
  OriginalUrl.parse(value, NO_OWN_HOSTS);

export const aShortLink = (overrides: Partial<ShortLinkProps> = {}): ShortLink =>
  ShortLink.restore({
    id: '0194a1b2-c3d4-7e5f-8a6b-0123456789ab',
    code: aCode(),
    originalUrl: aUrl(),
    visits: 0n,
    createdAt: NOW,
    lastVisitedAt: null,
    ...overrides,
  });

/** A `RandomIndex` that replays the given indices, then keeps returning the last one. */
export const scriptedPick = (indices: readonly number[]): RandomIndex => {
  let position = 0;
  return () => indices[Math.min(position++, indices.length - 1)] ?? 0;
};

/** Indices that make `ShortCode.random` spell the given word. */
export const indicesSpelling = (word: string): number[] =>
  Array.from(word, (char) => CODE_ALPHABET.indexOf(char));

/** Any stream of in-range indices, as a random source would produce. */
export const arbitraryIndices = (): fc.Arbitrary<number[]> =>
  fc.array(fc.integer({ min: 0, max: CODE_ALPHABET.length - 1 }), {
    minLength: CODE_LENGTH,
    maxLength: CODE_LENGTH * 4,
  });

/** Valid http(s) URLs, including IDN hosts, queries and fragments. */
export const arbitraryHttpUrl = (): fc.Arbitrary<string> =>
  fc.webUrl({
    validSchemes: ['http', 'https'],
    withQueryParameters: true,
    withFragments: true,
    authoritySettings: { withIPv4: true, withIPv6: true, withPort: true },
  });
