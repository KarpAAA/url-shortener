import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { HealthCheck, type HealthCheckResult, HealthCheckService } from '@nestjs/terminus';

import { ReadinessHealth } from './readiness.health';

@Controller('health')
@ApiExcludeController()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly readiness: ReadinessHealth,
  ) {}

  /** Liveness: the process answers. Checks nothing external — a restart would not fix a dead database. */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: the database answers and shutdown has not begun. 503 otherwise. */
  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([() => this.readiness.accepting(), () => this.readiness.database()]);
  }
}
