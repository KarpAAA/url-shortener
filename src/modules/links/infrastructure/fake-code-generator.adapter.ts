import { CODE_LENGTH, ShortCode } from '../domain/short-code';

import type { CodeGenerator } from '../ports/code-generator.port';

/**
 * Deterministic `CodeGenerator`: replays the scripted codes, then counts up
 * (`0000001`, `0000002`, …). Lets a test force collisions.
 */
export class FakeCodeGenerator implements CodeGenerator {
  private readonly scripted: string[];
  private counter = 0;
  private calls = 0;

  constructor(scripted: readonly string[] = []) {
    this.scripted = [...scripted];
  }

  generate(): ShortCode {
    this.calls += 1;
    const next = this.scripted.shift() ?? String(++this.counter).padStart(CODE_LENGTH, '0');
    return ShortCode.parse(next);
  }

  /** How many codes have been asked for. */
  get generated(): number {
    return this.calls;
  }
}
