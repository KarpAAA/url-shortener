import { type ArgumentsHost, Catch, type ExceptionFilter, Inject } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { newId } from '@shared/domain/id';
import { LOGGER, type Logger } from '@shared/logger/logger';

import { CORRELATION_HEADER } from '../middleware/correlation';

import { mapException, PROBLEM_TYPE, titleOf } from './problem-mapper';

import type { Request, Response } from 'express';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/** The one place an error becomes an HTTP response: RFC 9457 `application/problem+json`. */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(LOGGER) private readonly log: Logger,
    private readonly cls: ClsService,
  ) {}

  catch(err: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const { status, code, detail, errors, headers } = mapException(err);
    // outside a request context (should not happen) the problem still carries an id
    const correlationId = (this.cls.isActive() ? this.cls.getId() : undefined) ?? newId();

    if (status >= 500) this.log.error({ err, status, code }, 'request failed');
    else this.log.warn({ status, code }, 'request rejected');

    res
      .status(status)
      .set({ ...headers, [CORRELATION_HEADER]: correlationId })
      .type(PROBLEM_CONTENT_TYPE)
      .send(
        JSON.stringify({
          type: PROBLEM_TYPE,
          title: titleOf(status),
          status,
          detail,
          instance: req.path,
          code,
          correlationId,
          ...(errors && { errors }),
        }),
      );
  }
}
