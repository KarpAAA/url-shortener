import { describe, expect, it } from 'vitest';

import { indicesSpelling, scriptedPick } from './__test__/builders';
import { LinkNotFoundError } from './errors';
import { isReservedWord } from './reserved-codes';
import { CODE_ALPHABET, CODE_LENGTH, CODE_PATTERN, ShortCode } from './short-code';

describe('ShortCode alphabet', () => {
  it('R-15 is base62: digits, upper-case and lower-case letters, each once', () => {
    expect(CODE_ALPHABET).toHaveLength(62);
    expect(new Set(CODE_ALPHABET).size).toBe(62);
    expect(CODE_ALPHABET).toMatch(/^[0-9A-Za-z]+$/);
  });

  it('R-15 has a fixed length of 7', () => {
    expect(CODE_LENGTH).toBe(7);
    expect(CODE_PATTERN).toBe('^[0-9A-Za-z]{7}$');
  });
});

describe('ShortCode.parse', () => {
  it.each(['aB3xY9z', '0000000', 'ZZZZZZZ', 'zzzzzzz', '1234567'])(
    'R-24 accepts the well-formed code %s',
    (raw) => {
      expect(ShortCode.parse(raw).value).toBe(raw);
    },
  );

  it.each([
    ['too short', 'abc123'],
    ['too long', 'abc12345'],
    ['empty', ''],
    ['a dash', 'abc-123'],
    ['an underscore', 'abc_123'],
    ['a space', 'abc 123'],
    ['a dot', 'abc.123'],
    ['a slash', 'abc/123'],
    ['a non-ASCII letter', 'abcд123'],
    ['a trailing newline', 'abc1234\n'],
    ['a percent escape', 'abc%2012'],
  ])('R-24 treats a code with %s as not found', (_name, raw) => {
    expect(() => ShortCode.parse(raw)).toThrow(LinkNotFoundError);
  });

  it.each(['shorten', 'metrics', 'SHORTEN', 'Metrics', 'sHoRtEn'])(
    'R-16 treats the reserved word %s as not found',
    (raw) => {
      expect(() => ShortCode.parse(raw)).toThrow(LinkNotFoundError);
    },
  );
});

describe('reserved words', () => {
  it.each(['shorten', 'stats', 'health', 'docs', 'metrics'])('R-16 reserves %s', (word) => {
    expect(isReservedWord(word)).toBe(true);
    expect(isReservedWord(word.toUpperCase())).toBe(true);
  });

  it('R-16 does not reserve an ordinary code', () => {
    expect(isReservedWord('aB3xY9z')).toBe(false);
  });
});

describe('ShortCode.random', () => {
  it('R-15 builds the code from the alphabet characters the source picks', () => {
    const code = ShortCode.random(scriptedPick([0, 10, 36, 61, 1, 11, 37]));

    expect(code.value).toBe('0Aaz1Bb');
  });

  it('R-15 asks the source for an index within the alphabet, once per character', () => {
    const asked: number[] = [];

    ShortCode.random((exclusiveMax) => {
      asked.push(exclusiveMax);
      return 5;
    });

    expect(asked).toEqual(Array.from({ length: CODE_LENGTH }, () => 62));
  });

  it('R-16 draws again when the characters spell a reserved word', () => {
    const pick = scriptedPick([...indicesSpelling('shorten'), ...indicesSpelling('okCode1')]);

    expect(ShortCode.random(pick).value).toBe('okCode1');
  });

  it('R-16 draws again for a reserved word in any letter case', () => {
    const pick = scriptedPick([
      ...indicesSpelling('SHORTEN'),
      ...indicesSpelling('Metrics'),
      ...indicesSpelling('okCode2'),
    ]);

    expect(ShortCode.random(pick).value).toBe('okCode2');
  });
});

describe('ShortCode', () => {
  it('compares by value', () => {
    expect(ShortCode.parse('aB3xY9z').equals(ShortCode.parse('aB3xY9z'))).toBe(true);
    expect(ShortCode.parse('aB3xY9z').equals(ShortCode.parse('aB3xY9Z'))).toBe(false);
    expect(String(ShortCode.parse('aB3xY9z'))).toBe('aB3xY9z');
  });
});
