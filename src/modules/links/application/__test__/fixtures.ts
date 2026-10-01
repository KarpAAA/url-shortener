import { FixedClock } from '@shared/domain/__test__/fixed-clock';

import { FakeCodeGenerator } from '../../infrastructure/fake-code-generator.adapter';
import { InMemoryLinkRepository } from '../../infrastructure/in-memory-link.repository';
import { ResolveLinkService } from '../resolve-link.service';
import { ShortenUrlService } from '../shorten-url.service';

import type { LinkSettings } from '../../domain/link-settings';

export const SETTINGS: LinkSettings = {
  publicBaseUrl: 'https://sho.rt',
  ownHosts: ['sho.rt'],
};

export interface UseCases {
  links: InMemoryLinkRepository;
  codes: FakeCodeGenerator;
  clock: FixedClock;
  shorten: ShortenUrlService;
  resolve: ResolveLinkService;
}

/** Both use cases wired to the fakes; `scriptedCodes` are generated first, in order. */
export const useCases = (scriptedCodes: readonly string[] = []): UseCases => {
  const links = new InMemoryLinkRepository();
  const codes = new FakeCodeGenerator(scriptedCodes);
  const clock = new FixedClock();
  return {
    links,
    codes,
    clock,
    shorten: new ShortenUrlService(links, codes, clock, SETTINGS),
    resolve: new ResolveLinkService(links, clock),
  };
};
