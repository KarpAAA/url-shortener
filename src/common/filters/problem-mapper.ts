import { STATUS_CODES } from 'node:http';

import { HttpException } from '@nestjs/common';

import {
  ConflictError,
  DomainError,
  InvalidStateError,
  NotFoundError,
} from '@shared/errors/domain-error';
import { InfrastructureError } from '@shared/errors/infrastructure-error';

import { MethodNotAllowedProblem } from '../http/method-not-allowed.exception';
import { MalformedJsonException } from '../middleware/body-parser-errors';
import { type FieldError, ValidationFailedException } from '../pipes/validation-exception.factory';

/** What the filter needs to answer: everything of a problem except request-bound members. */
export interface MappedProblem {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly errors?: readonly FieldError[];
  readonly headers?: Readonly<Record<string, string>>;
}

export const PROBLEM_TYPE = 'about:blank';
const RETRY_AFTER_SECONDS = '5';

const HTTP_CODES: Readonly<Record<number, string>> = {
  400: 'BAD_REQUEST',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  406: 'NOT_ACCEPTABLE',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

/** Errors raised by Express middleware (body-parser, the router), keyed by their `type`. */
const MIDDLEWARE_PROBLEMS: Readonly<Record<string, Pick<MappedProblem, 'code' | 'detail'>>> = {
  'entity.parse.failed': { code: 'MALFORMED_JSON', detail: 'Request body is not valid JSON' },
  'entity.too.large': { code: 'PAYLOAD_TOO_LARGE', detail: 'Request body is too large' },
  'charset.unsupported': { code: 'UNSUPPORTED_MEDIA_TYPE', detail: 'Unsupported charset' },
  'encoding.unsupported': { code: 'UNSUPPORTED_MEDIA_TYPE', detail: 'Unsupported encoding' },
};

const INTERNAL: MappedProblem = {
  status: 500,
  code: 'INTERNAL',
  detail: 'An unexpected error occurred',
};

export const titleOf = (status: number): string => STATUS_CODES[status] ?? 'Unknown Error';

const codeOf = (status: number): string =>
  HTTP_CODES[status] ??
  titleOf(status)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');

const fromDomain = (status: number, err: DomainError): MappedProblem => ({
  status,
  code: err.code,
  detail: err.message,
});

const fromInfrastructure = (err: InfrastructureError): MappedProblem =>
  err.retryable
    ? {
        status: 503,
        code: err.code,
        detail: 'Service temporarily unavailable, retry later',
        headers: { 'Retry-After': RETRY_AFTER_SECONDS },
      }
    : { status: 502, code: err.code, detail: 'Upstream error' };

const fromNest = (err: HttpException): MappedProblem => {
  const status = err.getStatus();
  if (err instanceof ValidationFailedException) {
    return { status, code: 'VALIDATION_FAILED', detail: err.message, errors: err.fields };
  }
  if (err instanceof MethodNotAllowedProblem) {
    return {
      status,
      code: 'METHOD_NOT_ALLOWED',
      detail: err.message,
      headers: { Allow: err.allowed.join(', ') },
    };
  }
  if (err instanceof MalformedJsonException) {
    return { status, code: 'MALFORMED_JSON', detail: err.message };
  }
  if (status >= 500 && status !== 503) return { ...INTERNAL, status };
  return { status, code: codeOf(status), detail: status === 503 ? titleOf(status) : err.message };
};

interface MiddlewareError {
  readonly status: number;
  readonly type?: unknown;
}

/** `http-errors` instances from Express middleware: a client error it is safe to expose. */
const isMiddlewareClientError = (err: unknown): err is MiddlewareError => {
  if (typeof err !== 'object' || err === null) return false;
  const { status, expose } = err as { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true;
};

const fromMiddleware = (err: MiddlewareError): MappedProblem => {
  const known = typeof err.type === 'string' ? MIDDLEWARE_PROBLEMS[err.type] : undefined;
  return {
    status: err.status,
    code: known?.code ?? codeOf(err.status),
    detail: known?.detail ?? titleOf(err.status),
  };
};

/**
 * Maps any thrown value to a problem, by base class, most specific first. Adding a module
 * error never touches this function. An unknown error is a 500 with a generic detail —
 * its message never reaches the client.
 */
export function mapException(err: unknown): MappedProblem {
  if (err instanceof NotFoundError) return fromDomain(404, err);
  if (err instanceof ConflictError) return fromDomain(409, err);
  if (err instanceof InvalidStateError) return fromDomain(422, err);
  if (err instanceof DomainError) return fromDomain(400, err);
  if (err instanceof InfrastructureError) return fromInfrastructure(err);
  if (err instanceof HttpException) return fromNest(err);
  if (isMiddlewareClientError(err)) return fromMiddleware(err);
  return INTERNAL;
}
