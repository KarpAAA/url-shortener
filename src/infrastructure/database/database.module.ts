import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/** Primary: every write, and every read a write decision depends on. */
export const DB_WRITE = Symbol('DB_WRITE');
/** Query services. The same server today; a replica later is a change in this file only. */
export const DB_READ = Symbol('DB_READ');

export type Database = PrismaService;

@Global()
@Module({
  providers: [
    PrismaService,
    { provide: DB_WRITE, useExisting: PrismaService },
    { provide: DB_READ, useExisting: PrismaService },
  ],
  exports: [DB_WRITE, DB_READ],
})
export class DatabaseModule {}
