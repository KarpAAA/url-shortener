import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  ConflictError,
  DomainError,
  InvalidStateError,
  NotFoundError,
} from '@shared/errors/domain-error';
import { InfrastructureError } from '@shared/errors/infrastructure-error';

import { MethodNotAllowedProblem } from '../http/method-not-allowed.exception';
import { MalformedJsonException } from '../middleware/body-parser-errors';
import { validationExceptionFactory } from '../pipes/validation-exception.factory';

import { mapException, titleOf } from './problem-mapper';

class ThingNotFound extends NotFoundError {
  readonly code = 'THING_NOT_FOUND';
}
class ThingTaken extends ConflictError {
  readonly code = 'THING_TAKEN';
}
class ThingClosed extends InvalidStateError {
  readonly code = 'THING_CLOSED';
}
class ThingInvalid extends DomainError {
  readonly code = 'THING_INVALID';
}
class UpstreamDown extends InfrastructureError {
  readonly code = 'UPSTREAM_DOWN';
  readonly retryable = true;
}
class UpstreamRejected extends InfrastructureError {
  readonly code = 'UPSTREAM_REJECTED';
  readonly retryable = false;
}

describe('mapException', () => {
  it.each([
    ['NotFoundError', new ThingNotFound('no such thing'), 404, 'THING_NOT_FOUND'],
    ['ConflictError', new ThingTaken('already there'), 409, 'THING_TAKEN'],
    ['InvalidStateError', new ThingClosed('closed'), 422, 'THING_CLOSED'],
    ['any other DomainError', new ThingInvalid('bad thing'), 400, 'THING_INVALID'],
  ])('R-31 maps %s to its status, keeping the domain code and message', (_n, err, status, code) => {
    expect(mapException(err)).toEqual({ status, code, detail: err.message });
  });

  it('R-19 maps a retryable infrastructure error to 503 with Retry-After and no internals', () => {
    const problem = mapException(new UpstreamDown('pool exhausted at 10.0.0.5:5432'));

    expect(problem).toEqual({
      status: 503,
      code: 'UPSTREAM_DOWN',
      detail: 'Service temporarily unavailable, retry later',
      headers: { 'Retry-After': '5' },
    });
  });

  it('R-32 maps a non-retryable infrastructure error to 502 without its message', () => {
    const problem = mapException(new UpstreamRejected('api key sk_live_123 rejected'));

    expect(problem).toEqual({ status: 502, code: 'UPSTREAM_REJECTED', detail: 'Upstream error' });
  });

  it('R-03 maps a validation failure to 400 VALIDATION_FAILED with a flat list of fields', () => {
    const exception = validationExceptionFactory([
      { property: 'url', constraints: { isString: 'url must be a string' } },
      {
        property: 'options',
        children: [
          {
            property: 'items',
            children: [{ property: '0', constraints: { min: 'must not be less than 1' } }],
          },
        ],
      },
    ]);

    expect(mapException(exception)).toEqual({
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: 'Request validation failed',
      errors: [
        { path: 'url', code: 'isString', message: 'url must be a string' },
        { path: 'options.items.0', code: 'min', message: 'must not be less than 1' },
      ],
    });
  });

  it.each([
    [new NotFoundException('Cannot GET /nope'), 404, 'NOT_FOUND', 'Cannot GET /nope'],
    [new BadRequestException('bad'), 400, 'BAD_REQUEST', 'bad'],
    [new HttpException('Too Many Requests', 429), 429, 'RATE_LIMITED', 'Too Many Requests'],
    [new HttpException('nope', 405), 405, 'METHOD_NOT_ALLOWED', 'nope'],
    [new HttpException('teapot', 418), 418, 'I_M_A_TEAPOT', 'teapot'],
  ])(
    'R-33 maps a framework exception to its status and a code: %s',
    (err, status, code, detail) => {
      expect(mapException(err)).toEqual({ status, code, detail });
    },
  );

  it('R-12 maps malformed JSON to 400 MALFORMED_JSON with a message that echoes no input', () => {
    expect(mapException(new MalformedJsonException())).toEqual({
      status: 400,
      code: 'MALFORMED_JSON',
      detail: 'Request body is not valid JSON',
    });
  });

  it('R-49 maps an unsupported method to 405 with the Allow header', () => {
    expect(mapException(new MethodNotAllowedProblem(['GET', 'HEAD']))).toEqual({
      status: 405,
      code: 'METHOD_NOT_ALLOWED',
      detail: 'Method not allowed; use GET or HEAD',
      headers: { Allow: 'GET, HEAD' },
    });
  });

  it('R-41 maps a failed readiness check to 503 without the check details', () => {
    const problem = mapException(new ServiceUnavailableException({ database: { status: 'down' } }));

    expect(problem).toEqual({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      detail: 'Service Unavailable',
    });
  });

  it('R-32 hides the message of a framework 5xx exception', () => {
    const problem = mapException(new InternalServerErrorException('db password is hunter2'));

    expect(problem).toEqual({
      status: 500,
      code: 'INTERNAL',
      detail: 'An unexpected error occurred',
    });
  });

  it.each([
    ['entity.parse.failed', 400, 'MALFORMED_JSON', 'Request body is not valid JSON'],
    ['entity.too.large', 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large'],
    ['charset.unsupported', 415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported charset'],
    ['encoding.unsupported', 415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported encoding'],
  ])(
    'R-12 R-13 maps the body-parser error %s without echoing the parser message',
    (type, status, code, detail) => {
      const err = Object.assign(new Error('Unexpected token } in JSON at position 7'), {
        status,
        expose: true,
        type,
      });

      expect(mapException(err)).toEqual({ status, code, detail });
    },
  );

  it('R-12 maps an unknown client error from middleware by its status', () => {
    const err = Object.assign(new Error("Failed to decode param '%E0%A4%A'"), {
      status: 400,
      expose: true,
    });

    expect(mapException(err)).toEqual({ status: 400, code: 'BAD_REQUEST', detail: 'Bad Request' });
  });

  it.each([
    ['a plain Error', new Error('connect ECONNREFUSED 10.0.0.5:5432')],
    ['a TypeError', new TypeError("Cannot read properties of undefined (reading 'id')")],
    ['a thrown string', 'boom'],
    ['null', null],
    ['undefined', undefined],
    [
      'a middleware error that is not safe to expose',
      Object.assign(new Error('x'), { status: 400 }),
    ],
    ['a middleware 5xx', Object.assign(new Error('x'), { status: 502, expose: true })],
  ])('R-32 maps %s to a generic 500 that leaks nothing', (_name, err) => {
    expect(mapException(err)).toEqual({
      status: 500,
      code: 'INTERNAL',
      detail: 'An unexpected error occurred',
    });
  });
});

describe('titleOf', () => {
  it('R-31 is the HTTP status phrase', () => {
    expect(titleOf(404)).toBe('Not Found');
    expect(titleOf(503)).toBe('Service Unavailable');
    expect(titleOf(799)).toBe('Unknown Error');
  });
});
