// layered · L4 · CQS
import { Module } from '@nestjs/common';

import { appConfig, type AppConfig } from '@config/app.config';

import { ResolveLinkService } from './application/resolve-link.service';
import { ShortenUrlService } from './application/shorten-url.service';
import { LINK_SETTINGS, type LinkSettings } from './domain/link-settings';
import { CryptoCodeGenerator } from './infrastructure/crypto-code-generator.adapter';
import { PrismaLinkRepository } from './infrastructure/prisma-link.repository';
import { CODE_GENERATOR } from './ports/code-generator.port';
import { LINK_REPOSITORY } from './ports/link-repository.port';
import { LinksQueryService } from './read/links.query.service';

/**
 * Core module: inert until a transport calls it. No other business module exists, so there
 * is no facade — the use cases and the query service are exported for this module's own
 * transport module only (`links.http.module.ts`). The first second module gets a facade.
 */
@Module({
  providers: [
    // settings
    {
      provide: LINK_SETTINGS,
      inject: [appConfig.KEY],
      useFactory: (app: AppConfig): LinkSettings => ({
        publicBaseUrl: app.publicBaseUrl,
        ownHosts: app.ownHosts,
      }),
    },
    // write
    { provide: LINK_REPOSITORY, useClass: PrismaLinkRepository },
    { provide: CODE_GENERATOR, useClass: CryptoCodeGenerator },
    ShortenUrlService,
    ResolveLinkService,
    // read
    LinksQueryService,
  ],
  exports: [ShortenUrlService, ResolveLinkService, LinksQueryService],
})
export class LinksModule {}
