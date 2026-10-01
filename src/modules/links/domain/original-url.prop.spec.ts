import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbitraryHttpUrl, NO_OWN_HOSTS, OWN_HOST_RULES } from './__test__/builders';
import { InvalidUrlError } from './errors';
import { MAX_URL_LENGTH, OriginalUrl, URL_PATTERN } from './original-url';

const parseOrReason = (raw: unknown): OriginalUrl | InvalidUrlError => {
  try {
    return OriginalUrl.parse(raw, OWN_HOST_RULES);
  } catch (err) {
    if (err instanceof InvalidUrlError) return err;
    throw err;
  }
};

describe('OriginalUrl.parse — properties', () => {
  it('R-11 on any string it either returns a value or throws InvalidUrlError', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 300 }), (raw) => {
        const result = parseOrReason(raw);

        expect(result instanceof OriginalUrl || result instanceof InvalidUrlError).toBe(true);
      }),
      { numRuns: 2000 },
    );
  });

  it('R-11 on any value of any type it either returns a value or throws InvalidUrlError', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const result = parseOrReason(raw);

        expect(result instanceof OriginalUrl || result instanceof InvalidUrlError).toBe(true);
      }),
    );
  });

  it('R-11 on strings that look like URLs it never throws anything unexpected', () => {
    const urlish = fc
      .tuple(
        fc.constantFrom('http://', 'https://', 'HTTP://', 'ftp://', 'javascript:', '//', ''),
        fc.string({ unit: 'grapheme', maxLength: 60 }),
      )
      .map(([scheme, rest]) => scheme + rest);

    fc.assert(
      fc.property(urlish, (raw) => {
        const result = parseOrReason(raw);

        expect(result instanceof OriginalUrl || result instanceof InvalidUrlError).toBe(true);
      }),
      { numRuns: 2000 },
    );
  });

  it('R-05 R-06 whatever it accepts is an absolute http(s) URL without credentials', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 200 }), (raw) => {
        const result = parseOrReason(`http://${raw}`);
        if (result instanceof InvalidUrlError) return;

        const url = new URL(result.href);
        expect(['http:', 'https:']).toContain(url.protocol);
        expect(url.hostname).not.toBe('');
        expect(url.username + url.password).toBe('');
        expect(result.href.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
      }),
      { numRuns: 2000 },
    );
  });

  it('R-06 never accepts a string that does not match the published pattern', () => {
    const published = new RegExp(URL_PATTERN);

    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ unit: 'binary', maxLength: 80 }),
          fc.string({ unit: 'binary', maxLength: 80 }).map((rest) => `http:${rest}`),
          fc.string({ unit: 'binary', maxLength: 80 }).map((rest) => ` https://${rest}`),
        ),
        (raw) => {
          fc.pre(!published.test(raw));

          expect(parseOrReason(raw)).toBeInstanceOf(InvalidUrlError);
        },
      ),
      { numRuns: 3000 },
    );
  });

  it('R-10 accepts every valid http(s) URL and stores the WHATWG-normalised form', () => {
    fc.assert(
      fc.property(arbitraryHttpUrl(), (raw) => {
        expect(OriginalUrl.parse(raw, NO_OWN_HOSTS).href).toBe(new URL(raw).href);
      }),
      { numRuns: 1000 },
    );
  });

  it('R-10 normalisation is idempotent: a stored URL parses to itself', () => {
    fc.assert(
      fc.property(arbitraryHttpUrl(), (raw) => {
        const once = OriginalUrl.parse(raw, NO_OWN_HOSTS).href;

        expect(OriginalUrl.parse(once, NO_OWN_HOSTS).href).toBe(once);
      }),
      { numRuns: 1000 },
    );
  });

  it('R-05 rejects every scheme other than http and https', () => {
    const otherScheme = fc
      .stringMatching(/^[a-z][a-z0-9+.-]{1,10}$/)
      .filter((scheme) => scheme !== 'http' && scheme !== 'https');

    fc.assert(
      fc.property(otherScheme, fc.domain(), (scheme, host) => {
        expect(() => OriginalUrl.parse(`${scheme}://${host}/`, NO_OWN_HOSTS)).toThrow(
          InvalidUrlError,
        );
      }),
    );
  });
});
