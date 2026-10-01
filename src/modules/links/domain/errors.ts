import { ConflictError, DomainError, NotFoundError } from '@shared/errors/domain-error';
import { InfrastructureError } from '@shared/errors/infrastructure-error';

export type InvalidUrlReason =
  | 'not_a_string'
  | 'empty'
  | 'too_long'
  | 'malformed'
  | 'unsupported_scheme'
  | 'credentials'
  | 'self_reference';

const INVALID_URL_MESSAGES: Record<InvalidUrlReason, string> = {
  not_a_string: 'URL must be a string',
  empty: 'URL must not be empty',
  too_long: 'URL is longer than the maximum allowed length',
  malformed: 'URL must be an absolute http(s) URL with a host',
  unsupported_scheme: 'URL scheme must be http or https',
  credentials: 'URL must not contain a username or password',
  self_reference: 'URL must not point to this service',
};

export class InvalidUrlError extends DomainError {
  readonly code = 'INVALID_URL';

  constructor(readonly reason: InvalidUrlReason) {
    super(INVALID_URL_MESSAGES[reason], { reason });
  }
}

export class LinkNotFoundError extends NotFoundError {
  readonly code = 'LINK_NOT_FOUND';

  constructor() {
    // the requested code is not echoed: it is arbitrary client input
    super('Short link not found');
  }
}

export class ShortCodeTakenError extends ConflictError {
  readonly code = 'SHORT_CODE_TAKEN';

  constructor() {
    super('Short code is already taken');
  }
}

/**
 * Every candidate code collided. Not a business refusal: the client did nothing wrong and
 * a retry will almost certainly succeed, hence a retryable infrastructure error (503).
 */
export class ShortCodeAllocationError extends InfrastructureError {
  readonly code = 'SHORT_CODE_ALLOCATION_FAILED';
  readonly retryable = true;

  constructor(readonly attempts: number) {
    super(`Could not allocate a unique short code in ${attempts} attempts`);
  }
}
