import { BadRequestException, type ValidationError } from '@nestjs/common';

export interface FieldError {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

/** A request whose shape is wrong. The filter turns `fields` into `errors[]`. */
export class ValidationFailedException extends BadRequestException {
  constructor(readonly fields: readonly FieldError[]) {
    super('Request validation failed');
  }
}

const flatten = (errors: readonly ValidationError[], parent = ''): FieldError[] =>
  errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.entries(error.constraints ?? {}).map(([code, message]) => ({
      path,
      code,
      message,
    }));
    return [...own, ...flatten(error.children ?? [], path)];
  });

/** `ValidationPipe({ exceptionFactory })`: a flat list of field errors, dot-notation paths. */
export const validationExceptionFactory = (
  errors: readonly ValidationError[],
): ValidationFailedException => new ValidationFailedException(flatten(errors));
