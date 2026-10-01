import { describe, expect, it } from 'vitest';

import { ConflictError, DomainError, NotFoundError } from '@shared/errors/domain-error';
import { InfrastructureError } from '@shared/errors/infrastructure-error';

import {
  InvalidUrlError,
  type InvalidUrlReason,
  LinkNotFoundError,
  ShortCodeAllocationError,
  ShortCodeTakenError,
} from './errors';

// `code` is API contract and `message` becomes the problem `detail`: both are pinned here.
describe('link errors', () => {
  it.each<[InvalidUrlReason, string]>([
    ['not_a_string', 'URL must be a string'],
    ['empty', 'URL must not be empty'],
    ['too_long', 'URL is longer than the maximum allowed length'],
    ['malformed', 'URL must be an absolute http(s) URL with a host'],
    ['unsupported_scheme', 'URL scheme must be http or https'],
    ['credentials', 'URL must not contain a username or password'],
    ['self_reference', 'URL must not point to this service'],
  ])('R-05 InvalidUrlError(%s) is a 400-class domain error that says why', (reason, message) => {
    const error = new InvalidUrlError(reason);

    expect(error).toBeInstanceOf(DomainError);
    expect(error).not.toBeInstanceOf(NotFoundError);
    expect(error).not.toBeInstanceOf(ConflictError);
    expect(error.code).toBe('INVALID_URL');
    expect(error.reason).toBe(reason);
    expect(error.message).toBe(message);
    expect(error.details).toEqual({ reason });
    expect(error.name).toBe('InvalidUrlError');
  });

  it('R-23 LinkNotFoundError is a not-found error that does not echo the requested code', () => {
    const error = new LinkNotFoundError();

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.code).toBe('LINK_NOT_FOUND');
    expect(error.message).toBe('Short link not found');
    expect(error.details).toBeUndefined();
  });

  it('R-17 ShortCodeTakenError is a conflict', () => {
    const error = new ShortCodeTakenError();

    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBe('SHORT_CODE_TAKEN');
    expect(error.message).toBe('Short code is already taken');
  });

  it('R-19 ShortCodeAllocationError is a retryable infrastructure error naming the attempts', () => {
    const error = new ShortCodeAllocationError(5);

    expect(error).toBeInstanceOf(InfrastructureError);
    expect(error).not.toBeInstanceOf(DomainError);
    expect(error.code).toBe('SHORT_CODE_ALLOCATION_FAILED');
    expect(error.retryable).toBe(true);
    expect(error.attempts).toBe(5);
    expect(error.message).toBe('Could not allocate a unique short code in 5 attempts');
  });
});
