import type { ShortCode } from '../domain/short-code';

export const CODE_GENERATOR = Symbol('CODE_GENERATOR');

/** Source of fresh short codes. Uniqueness is not its concern — the database decides. */
export interface CodeGenerator {
  generate(): ShortCode;
}
