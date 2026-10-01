import { Inject, Injectable } from '@nestjs/common';
import { type HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';

import { type Database, DB_WRITE } from '../database/database.module';

import { ShutdownState } from './shutdown-state';

const DATABASE_TIMEOUT_MS = 2000; // observability.md §4

@Injectable()
export class ReadinessHealth {
  constructor(
    private readonly indicators: HealthIndicatorService,
    @Inject(DB_WRITE) private readonly db: Database,
    private readonly shutdown: ShutdownState,
  ) {}

  /** The database answers `SELECT 1` within the timeout. */
  async database(): Promise<HealthIndicatorResult> {
    const indicator = this.indicators.check('database');
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error('timeout'));
      }, DATABASE_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.db.$queryRaw`SELECT 1`, timeout]);
      return indicator.up();
    } catch {
      return indicator.down();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Not ready once shutdown has begun, so the load balancer stops routing here. */
  accepting(): HealthIndicatorResult {
    const indicator = this.indicators.check('accepting');
    return this.shutdown.isShuttingDown ? indicator.down() : indicator.up();
  }
}
