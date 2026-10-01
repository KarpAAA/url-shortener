import { applyDecorators } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';

import { ApiProblemResponse } from '@common/swagger/api-problem-response.decorator';

import { CODE_LENGTH, CODE_PATTERN } from '../domain/short-code';
import { LinkStatsDto } from '../read/dto/link-stats.dto';
import { ShortLinkDto } from '../read/dto/short-link.dto';

type EndpointDocs = MethodDecorator & ClassDecorator;

const SHORTEN = '/shorten';

const RETRY_AFTER = {
  'Retry-After': { description: 'Seconds to wait before retrying.', schema: { type: 'integer' } },
};

const CodeParam = (): EndpointDocs =>
  ApiParam({
    name: 'code',
    description: 'Short code: 7 base62 characters.',
    example: 'aB3xY9z',
    schema: {
      type: 'string',
      pattern: CODE_PATTERN,
      minLength: CODE_LENGTH,
      maxLength: CODE_LENGTH,
    },
  });

const LinkNotFound = (instance: string): EndpointDocs =>
  ApiProblemResponse(404, {
    description: 'No link has this code, or the value is not a well-formed code.',
    examples: [
      { name: 'notFound', code: 'LINK_NOT_FOUND', detail: 'Short link not found', instance },
    ],
  });

const ShortenBadRequest = (): EndpointDocs =>
  ApiProblemResponse(400, {
    description: 'The body is not valid JSON, has the wrong shape, or the URL is not acceptable.',
    examples: [
      {
        name: 'invalidUrl',
        code: 'INVALID_URL',
        detail: 'URL scheme must be http or https',
        instance: SHORTEN,
      },
      {
        name: 'validationFailed',
        code: 'VALIDATION_FAILED',
        detail: 'Request validation failed',
        instance: SHORTEN,
        errors: [{ path: 'url', code: 'isString', message: 'url must be a string' }],
      },
      {
        name: 'malformedJson',
        code: 'MALFORMED_JSON',
        detail: 'Request body is not valid JSON',
        instance: SHORTEN,
      },
    ],
  });

const ShortenTooLarge = (): EndpointDocs =>
  ApiProblemResponse(413, {
    description: 'The request body is larger than 10 kB.',
    examples: [
      {
        name: 'tooLarge',
        code: 'PAYLOAD_TOO_LARGE',
        detail: 'Request body is too large',
        instance: SHORTEN,
      },
    ],
  });

const ShortenRateLimited = (): EndpointDocs =>
  ApiProblemResponse(429, {
    description: 'Too many links created from this address.',
    headers: RETRY_AFTER,
    examples: [
      {
        name: 'rateLimited',
        code: 'RATE_LIMITED',
        detail: 'ThrottlerException: Too Many Requests',
        instance: SHORTEN,
      },
    ],
  });

const ShortenUnavailable = (): EndpointDocs =>
  ApiProblemResponse(503, {
    description: 'A unique code could not be allocated; retrying is safe.',
    headers: RETRY_AFTER,
    examples: [
      {
        name: 'allocationFailed',
        code: 'SHORT_CODE_ALLOCATION_FAILED',
        detail: 'Service temporarily unavailable, retry later',
        instance: SHORTEN,
      },
    ],
  });

export const ApiShortenUrl = (): EndpointDocs =>
  applyDecorators(
    ApiOperation({
      summary: 'Shorten a URL',
      description:
        'Creates a new short link. Not idempotent: shortening the same URL again creates ' +
        'another link with its own code and its own statistics.',
    }),
    ApiCreatedResponse({
      type: ShortLinkDto,
      description: 'The short link was created.',
      headers: {
        Location: {
          description: 'Path of the statistics resource of the new link.',
          schema: { type: 'string', example: '/stats/aB3xY9z' },
        },
      },
      // lets clients — and the schema fuzzer — follow a created link to its other operations
      links: {
        redirect: {
          operationId: 'redirect',
          parameters: { code: '$response.body#/code' },
          description: 'Visit the short link.',
        },
        getStats: {
          operationId: 'getStats',
          parameters: { code: '$response.body#/code' },
          description: 'Read the statistics of the short link.',
        },
      },
    }),
    ShortenBadRequest(),
    ShortenTooLarge(),
    ShortenRateLimited(),
    ShortenUnavailable(),
  );

export const ApiGetStats = (): EndpointDocs =>
  applyDecorators(
    ApiOperation({
      summary: 'Visit statistics of a short link',
      description: 'Reading statistics does not count as a visit.',
    }),
    CodeParam(),
    ApiOkResponse({ type: LinkStatsDto }),
    LinkNotFound('/stats/aB3xY9z'),
  );

export const ApiRedirect = (): EndpointDocs =>
  applyDecorators(
    ApiOperation({
      summary: 'Redirect to the original URL',
      description:
        'Counts one visit and redirects. The redirect is a `302` with `Cache-Control: ' +
        'no-store`: browsers do not cache it, so every visit reaches the server and is counted.',
    }),
    CodeParam(),
    ApiFoundResponse({
      description: 'Redirect to the original URL.',
      headers: {
        Location: { description: 'The original URL.', schema: { type: 'string', format: 'uri' } },
        'Cache-Control': { description: 'Always `no-store`.', schema: { type: 'string' } },
      },
    }),
    LinkNotFound('/aB3xY9z'),
  );
