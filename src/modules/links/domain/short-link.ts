import { newId } from '@shared/domain/id';

import type { OriginalUrl } from './original-url';
import type { ShortCode } from './short-code';

export interface ShortLinkProps {
  readonly id: string;
  readonly code: ShortCode;
  readonly originalUrl: OriginalUrl;
  readonly visits: bigint;
  readonly createdAt: Date;
  readonly lastVisitedAt: Date | null;
}

/**
 * A shortened URL. Immutable after creation: the only thing that changes is the visit
 * counter, and that is incremented atomically in the database, never through this object
 * (docs/adr/0006-atomic-visit-counter.md).
 */
export class ShortLink {
  private constructor(private readonly props: ShortLinkProps) {}

  static shorten(input: { code: ShortCode; originalUrl: OriginalUrl; now: Date }): ShortLink {
    return new ShortLink({
      id: newId(input.now.getTime()),
      code: input.code,
      originalUrl: input.originalUrl,
      visits: 0n,
      createdAt: input.now,
      lastVisitedAt: null,
    });
  }

  /** Rehydration from persistence: no validation, stored data is trusted. */
  static restore(props: ShortLinkProps): ShortLink {
    return new ShortLink(props);
  }

  get id(): string {
    return this.props.id;
  }

  get code(): ShortCode {
    return this.props.code;
  }

  get originalUrl(): OriginalUrl {
    return this.props.originalUrl;
  }

  get visits(): bigint {
    return this.props.visits;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get lastVisitedAt(): Date | null {
    return this.props.lastVisitedAt;
  }

  snapshot(): ShortLinkProps {
    return { ...this.props };
  }
}
