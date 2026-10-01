import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

import { ProblemDetailsDto } from '../dto/problem-details.dto';
import { titleOf } from '../filters/problem-mapper';

export interface ProblemExample {
  /** Name of the example in the OpenAPI document. */
  readonly name: string;
  readonly code: string;
  readonly detail: string;
  readonly instance: string;
  readonly errors?: readonly { path: string; code: string; message: string }[];
}

interface ProblemResponseOptions {
  readonly description: string;
  readonly examples: readonly ProblemExample[];
  readonly headers?: Record<string, { description: string; schema: { type: string } }>;
}

const EXAMPLE_CORRELATION_ID = '0194a1b2-c3d4-7e5f-8a6b-0123456789ab';

/**
 * Documents one error status of an endpoint as `application/problem+json`. Errors are
 * declared per endpoint (not once globally) because the schema is checked against the
 * running service: each endpoint must list exactly the statuses it can return.
 */
export const ApiProblemResponse = (
  status: number,
  { description, examples, headers }: ProblemResponseOptions,
): MethodDecorator & ClassDecorator =>
  applyDecorators(
    ApiExtraModels(ProblemDetailsDto),
    ApiResponse({
      status,
      description,
      ...(headers && { headers }),
      content: {
        'application/problem+json': {
          schema: { $ref: getSchemaPath(ProblemDetailsDto) },
          examples: Object.fromEntries(
            examples.map(({ name, ...problem }) => [
              name,
              {
                value: {
                  type: 'about:blank',
                  title: titleOf(status),
                  status,
                  detail: problem.detail,
                  instance: problem.instance,
                  code: problem.code,
                  correlationId: EXAMPLE_CORRELATION_ID,
                  ...(problem.errors && { errors: problem.errors }),
                },
              },
            ]),
          ),
        },
      },
    }),
  );
