import { Inject } from '@nestjs/common';

import { UseCase } from '@common/decorators/use-case.decorator';
import { CLOCK, type Clock } from '@shared/domain/clock';

import { ShortCode } from '../domain/short-code';
import { LINK_REPOSITORY, type LinkRepository } from '../ports/link-repository.port';

import type { ResolveLinkCommand } from './resolve-link.command';

@UseCase()
export class ResolveLinkService {
  constructor(
    @Inject(LINK_REPOSITORY) private readonly links: LinkRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Counts the visit and returns the destination. Deviates from "a use case returns void":
   * the count and the lookup are one atomic statement, and reading the URL separately
   * would be a second round trip on the hottest path of the service.
   */
  async execute(cmd: ResolveLinkCommand): Promise<{ url: string }> {
    const code = ShortCode.parse(cmd.code);
    const originalUrl = await this.links.registerVisit(code, this.clock.now());
    return { url: originalUrl.href };
  }
}
