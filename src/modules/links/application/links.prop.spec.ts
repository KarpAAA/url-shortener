import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbitraryHttpUrl } from '../domain/__test__/builders';
import { ShortCodeAllocationError } from '../domain/errors';

import { useCases } from './__test__/fixtures';
import { MAX_CODE_ATTEMPTS } from './shorten-url.service';

describe('shorten → resolve — properties', () => {
  it('R-20 any valid URL round-trips: resolve returns the normalised URL that was shortened', async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryHttpUrl(), async (url) => {
        const { shorten, resolve } = useCases();

        const { code } = await shorten.execute({ url });

        await expect(resolve.execute({ code })).resolves.toEqual({ url: new URL(url).href });
      }),
      { numRuns: 500 },
    );
  });

  it('R-20 many URLs shortened into one store each resolve to their own destination', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbitraryHttpUrl(), { minLength: 1, maxLength: 30 }),
        async (urls) => {
          const { shorten, resolve } = useCases();
          const codes = [];
          for (const url of urls) codes.push((await shorten.execute({ url })).code);

          expect(new Set(codes).size).toBe(urls.length);
          for (const [index, code] of codes.entries()) {
            const expected = new URL(urls[index] ?? '').href;
            await expect(resolve.execute({ code })).resolves.toEqual({ url: expected });
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('R-26 after n resolutions the link has exactly n visits', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 60 }), async (visits) => {
        const { shorten, resolve, links } = useCases();
        const { code } = await shorten.execute({ url: 'https://example.com/' });

        for (let i = 0; i < visits; i++) await resolve.execute({ code });

        expect(links.find(code)?.visits).toBe(BigInt(visits));
        expect(links.find(code)?.lastVisitedAt === null).toBe(visits === 0);
      }),
      { numRuns: 100 },
    );
  });

  it('R-18 R-19 k consecutive collisions succeed iff k is below the attempt limit', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: MAX_CODE_ATTEMPTS * 2 }), async (collisions) => {
        const taken = Array.from({ length: collisions }, () => 'taken01');
        const { shorten, links } = useCases(['taken01', ...taken, 'free001']);
        await shorten.execute({ url: 'https://example.com/first' });

        const attempt = shorten.execute({ url: 'https://example.com/second' });

        if (collisions < MAX_CODE_ATTEMPTS) {
          await expect(attempt).resolves.toEqual({ code: 'free001' });
          expect(links.size).toBe(2);
        } else {
          await expect(attempt).rejects.toBeInstanceOf(ShortCodeAllocationError);
          expect(links.size).toBe(1);
        }
      }),
    );
  });
});
