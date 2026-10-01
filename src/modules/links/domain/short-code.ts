import { LinkNotFoundError } from './errors';
import { isReservedWord } from './reserved-codes';

export const CODE_LENGTH = 7;
/** base62: 62^7 ≈ 3.5e12 codes (docs/adr/0004-short-code-generation.md). */
export const CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const CODE_PATTERN = `^[0-9A-Za-z]{${CODE_LENGTH}}$`;

const WELL_FORMED = new RegExp(CODE_PATTERN);

/** Uniformly distributed integer in `[0, exclusiveMax)`. */
export type RandomIndex = (exclusiveMax: number) => number;

/** The public identifier of a short link. An instance is well-formed and not reserved. */
export class ShortCode {
  private constructor(readonly value: string) {}

  /**
   * A code taken from a request. A string that could never have been issued identifies no
   * link, so it is "not found" rather than "invalid" — and the database is never asked.
   */
  static parse(raw: string): ShortCode {
    if (!ShortCode.isIssuable(raw)) throw new LinkNotFoundError();
    return new ShortCode(raw);
  }

  /** A fresh code; draws again when the characters spell a reserved word. */
  static random(pick: RandomIndex): ShortCode {
    for (;;) {
      const candidate = Array.from({ length: CODE_LENGTH }, () =>
        CODE_ALPHABET.charAt(pick(CODE_ALPHABET.length)),
      ).join('');
      if (ShortCode.isIssuable(candidate)) return new ShortCode(candidate);
    }
  }

  private static isIssuable(candidate: string): boolean {
    return WELL_FORMED.test(candidate) && !isReservedWord(candidate);
  }

  equals(other: ShortCode): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
