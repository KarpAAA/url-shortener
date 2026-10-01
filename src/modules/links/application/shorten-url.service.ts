import { Inject } from '@nestjs/common';

import { UseCase } from '@common/decorators/use-case.decorator';
import { CLOCK, type Clock } from '@shared/domain/clock';

import { ShortCodeAllocationError, ShortCodeTakenError } from '../domain/errors';
import { LINK_SETTINGS, type LinkSettings } from '../domain/link-settings';
import { OriginalUrl } from '../domain/original-url';
import { ShortLink } from '../domain/short-link';
import { CODE_GENERATOR, type CodeGenerator } from '../ports/code-generator.port';
import { LINK_REPOSITORY, type LinkRepository } from '../ports/link-repository.port';

import type { ShortenUrlCommand } from './shorten-url.command';

/**
 * At 62^7 codes a collision is a ~1e-7 event per insert even with a million links; five
 * consecutive ones mean something is broken, not unlucky (docs/adr/0004).
 */
export const MAX_CODE_ATTEMPTS = 5;

@UseCase()
export class ShortenUrlService {
  constructor(
    @Inject(LINK_REPOSITORY) private readonly links: LinkRepository,
    @Inject(CODE_GENERATOR) private readonly codes: CodeGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LINK_SETTINGS) private readonly settings: LinkSettings,
  ) {}

  /**
   * Insert-and-retry, never check-then-insert: the unique index is the only arbiter of
   * "is this code free", so two concurrent requests cannot both win the same code.
   */
  async execute(cmd: ShortenUrlCommand): Promise<{ code: string }> {
    const originalUrl = OriginalUrl.parse(cmd.url, this.settings);

    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
      const link = ShortLink.shorten({
        code: this.codes.generate(),
        originalUrl,
        now: this.clock.now(),
      });
      try {
        await this.links.insert(link);
        return { code: link.code.value };
      } catch (err) {
        // the one business reaction to a taken code is to draw another
        if (!(err instanceof ShortCodeTakenError)) throw err;
      }
    }
    throw new ShortCodeAllocationError(MAX_CODE_ATTEMPTS);
  }
}
