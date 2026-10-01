import { BadRequestException } from '@nestjs/common';

import type { NextFunction, Request, Response } from 'express';

/** The request body could not be parsed as JSON. */
export class MalformedJsonException extends BadRequestException {
  constructor() {
    super('Request body is not valid JSON');
  }
}

const isParseFailure = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  (err as { type?: unknown }).type === 'entity.parse.failed';

/**
 * Mounted right after the JSON body parser. Nest would turn the parser's `SyntaxError` into
 * a generic 400 carrying the parser's own message ("Unexpected token } in JSON at position
 * 7"); this gives it a stable code and a message that does not echo the input.
 */
export function bodyParserErrors() {
  return (err: unknown, _req: Request, _res: Response, next: NextFunction): void => {
    next(isParseFailure(err) ? new MalformedJsonException() : err);
  };
}
