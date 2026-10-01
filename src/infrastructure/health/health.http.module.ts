// transport · http
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { ReadinessHealth } from './readiness.health';
import { ShutdownState } from './shutdown-state';

@Module({
  imports: [TerminusModule.forRoot({ errorLogStyle: 'json' })],
  controllers: [HealthController],
  providers: [ReadinessHealth, ShutdownState],
})
export class HealthHttpModule {}
