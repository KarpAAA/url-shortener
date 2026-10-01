import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { databaseConfig, type DatabaseConfig } from '@config/database.config';

import { PrismaClient } from './generated/prisma/client';

/** The single Prisma client of the process. Nobody else calls `new PrismaClient()`. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(databaseConfig.KEY) config: DatabaseConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.url,
        max: config.poolSize,
        // a startup parameter, not a session SET: safe behind a transaction-mode pooler
        statement_timeout: config.statementTimeoutMs,
      }),
      log: ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /**
   * Not `onModuleDestroy`: that hook runs before the HTTP server stops accepting work, and
   * in-flight requests would lose their database. This one runs after the server has closed.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
