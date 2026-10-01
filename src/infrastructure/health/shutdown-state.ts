import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
  type OnModuleDestroy,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { appConfig, type AppConfig } from '@config/app.config';
import { LOGGER, type Logger } from '@shared/logger/logger';

import type { Server } from 'node:http';

const IDLE_SWEEP_INTERVAL_MS = 100;

/**
 * Tracks graceful shutdown. On SIGTERM Nest runs `onModuleDestroy` first, so readiness
 * turns 503 before the HTTP server stops accepting connections; in-flight requests then
 * drain, and only after that is the database disconnected (`PrismaService`).
 */
@Injectable()
export class ShutdownState implements OnModuleDestroy, OnApplicationShutdown {
  private shuttingDown = false;
  private deadline: NodeJS.Timeout | undefined;
  private idleSweep: NodeJS.Timeout | undefined;

  constructor(
    @Inject(appConfig.KEY) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly log: Logger,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    this.log.info({ timeoutMs: this.config.shutdownTimeoutMs }, 'shutdown started, draining');

    // `server.close()` waits for keep-alive connections; one that goes idle after close was
    // called would hold the process for the whole keep-alive timeout. Sweep them as they idle.
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    this.idleSweep = setInterval(() => {
      server.closeIdleConnections();
    }, IDLE_SWEEP_INTERVAL_MS);
    this.idleSweep.unref();

    // a request that never finishes must not keep the process past the orchestrator's grace period
    this.deadline = setTimeout(() => {
      this.log.error({ timeoutMs: this.config.shutdownTimeoutMs }, 'drain timed out, exiting');
      process.exit(1);
    }, this.config.shutdownTimeoutMs);
    this.deadline.unref();
  }

  onApplicationShutdown(signal?: string): void {
    clearInterval(this.idleSweep);
    clearTimeout(this.deadline);
    this.log.info({ signal }, 'shutdown complete');
  }
}
