import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The path exists but not with this method. Carries the methods it does support, which the
 * filter returns in the `Allow` header (RFC 9110 §15.5.6).
 */
export class MethodNotAllowedProblem extends HttpException {
  constructor(readonly allowed: readonly string[]) {
    super(`Method not allowed; use ${allowed.join(' or ')}`, HttpStatus.METHOD_NOT_ALLOWED);
  }
}
