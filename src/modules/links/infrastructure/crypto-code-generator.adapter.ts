import { randomInt } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { ShortCode } from '../domain/short-code';

import type { CodeGenerator } from '../ports/code-generator.port';

/**
 * Cryptographically random codes. `crypto.randomInt` is uniform over `[0, max)` (it rejects
 * and redraws instead of taking a modulo), so no character is more likely than another and
 * a code cannot be predicted from the ones issued before it.
 */
@Injectable()
export class CryptoCodeGenerator implements CodeGenerator {
  generate(): ShortCode {
    return ShortCode.random((exclusiveMax) => randomInt(exclusiveMax));
  }
}
