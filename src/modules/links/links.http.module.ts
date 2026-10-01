// transport · http
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { httpConfig, type HttpConfig } from '@config/http.config';

import { LinksController } from './interface/links.controller';
import { LinksModule } from './links.module';

@Module({
  imports: [
    LinksModule,
    // in-memory storage: one instance. Applied to POST /shorten only (docs/adr/0010).
    ThrottlerModule.forRootAsync({
      inject: [httpConfig.KEY],
      useFactory: (http: HttpConfig) => [
        { ttl: http.shortenRateTtlMs, limit: http.shortenRateLimit },
      ],
    }),
  ],
  controllers: [LinksController],
})
export class LinksHttpModule {}
