import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbitraryIndices, indicesSpelling, scriptedPick } from './__test__/builders';
import { LinkNotFoundError } from './errors';
import { isReservedWord } from './reserved-codes';
import { CODE_ALPHABET, CODE_LENGTH, ShortCode } from './short-code';

const RESERVED = ['shorten', 'metrics', 'SHORTEN', 'Metrics'];

describe('ShortCode — properties', () => {
  it('R-15 R-16 every generated code is 7 base62 characters and never a reserved word', () => {
    fc.assert(
      fc.property(arbitraryIndices(), (indices) => {
        const code = ShortCode.random(scriptedPick(indices)).value;

        expect(code).toHaveLength(CODE_LENGTH);
        expect(Array.from(code).every((char) => CODE_ALPHABET.includes(char))).toBe(true);
        expect(isReservedWord(code)).toBe(false);
      }),
      { numRuns: 2000 },
    );
  });

  it('R-16 a source that first spells reserved words still yields an ordinary code', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...RESERVED), { minLength: 1, maxLength: 5 }),
        arbitraryIndices(),
        (words, tail) => {
          const indices = [
            ...words.flatMap(indicesSpelling),
            ...tail,
            ...indicesSpelling('0000000'),
          ];
          const code = ShortCode.random(scriptedPick(indices)).value;

          expect(isReservedWord(code)).toBe(false);
          expect(code).toHaveLength(CODE_LENGTH);
        },
      ),
    );
  });

  it('R-15 every generated code survives a round-trip through parse', () => {
    fc.assert(
      fc.property(arbitraryIndices(), (indices) => {
        const code = ShortCode.random(scriptedPick(indices));

        expect(ShortCode.parse(code.value).equals(code)).toBe(true);
      }),
    );
  });

  it('R-24 any string is either a well-formed, unreserved code or not found', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 12 }), (raw) => {
        const wellFormed = /^[0-9A-Za-z]{7}$/.test(raw) && !isReservedWord(raw);

        if (wellFormed) expect(ShortCode.parse(raw).value).toBe(raw);
        else expect(() => ShortCode.parse(raw)).toThrow(LinkNotFoundError);
      }),
      { numRuns: 2000 },
    );
  });
});
