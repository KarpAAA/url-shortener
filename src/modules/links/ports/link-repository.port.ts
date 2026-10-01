import type { OriginalUrl } from '../domain/original-url';
import type { ShortCode } from '../domain/short-code';
import type { ShortLink } from '../domain/short-link';

export const LINK_REPOSITORY = Symbol('LINK_REPOSITORY');

/**
 * Persistence of short links. Two operations, both a single atomic statement — there is
 * deliberately no `getById` + `save`, because counting a visit that way is a
 * read-modify-write that loses updates under concurrency.
 */
export interface LinkRepository {
  /**
   * Stores a new link.
   * @throws ShortCodeTakenError when the code already exists (unique constraint).
   */
  insert(link: ShortLink): Promise<void>;

  /**
   * Counts one visit and returns the destination, atomically.
   * @throws LinkNotFoundError when no link has this code.
   */
  registerVisit(code: ShortCode, at: Date): Promise<OriginalUrl>;
}
