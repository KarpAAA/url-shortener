import { Module } from '@nestjs/common';

import { HealthHttpModule } from '@infra/health/health.http.module';
import { SharedModule } from '@infra/shared.module';

import { LinksHttpModule } from '../modules/links/links.http.module';

// HealthHttpModule first: its routes are registered before the root catch-all `GET /:code`
@Module({ imports: [SharedModule, HealthHttpModule, LinksHttpModule] })
export class ApiModule {}
