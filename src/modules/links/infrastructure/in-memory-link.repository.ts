import { LinkNotFoundError, ShortCodeTakenError } from '../domain/errors';
import { ShortLink } from '../domain/short-link';

import type { OriginalUrl } from '../domain/original-url';
import type { ShortCode } from '../domain/short-code';
import type { LinkRepository } from '../ports/link-repository.port';

/**
 * Fake `LinkRepository` for use-case tests: same contract as the Prisma one (unique code,
 * visit counted on resolve), no database. `test/links/link-repository.int-spec.ts` runs the
 * real adapter through the same expectations.
 */
export class InMemoryLinkRepository implements LinkRepository {
  private readonly links = new Map<string, ShortLink>();
  private readonly failures: Error[] = [];

  insert(link: ShortLink): Promise<void> {
    const failure = this.failures.shift();
    if (failure) return Promise.reject(failure);
    if (this.links.has(link.code.value)) return Promise.reject(new ShortCodeTakenError());
    this.links.set(link.code.value, link);
    return Promise.resolve();
  }

  registerVisit(code: ShortCode, at: Date): Promise<OriginalUrl> {
    const link = this.links.get(code.value);
    if (!link) return Promise.reject(new LinkNotFoundError());
    this.links.set(
      code.value,
      ShortLink.restore({ ...link.snapshot(), visits: link.visits + 1n, lastVisitedAt: at }),
    );
    return Promise.resolve(link.originalUrl);
  }

  /** Makes the next `insert` reject with the given error. */
  failNextInsert(error: Error): void {
    this.failures.push(error);
  }

  find(code: string): ShortLink | undefined {
    return this.links.get(code);
  }

  get size(): number {
    return this.links.size;
  }
}
