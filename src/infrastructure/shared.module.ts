import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';

import { AppExceptionFilter } from '@common/filters/app-exception.filter';
import { AppConfigModule } from '@config/config.module';
import { CLOCK, SystemClock } from '@shared/domain/clock';

import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './logger/logger.module';

/**
 * The frame every entrypoint imports: configuration, request context, logger, database,
 * clock and the single exception filter. Identical for every business module.
 */
@Global()
@Module({
  imports: [
    AppConfigModule,
    // the middleware is mounted by hand in bootstrap.ts, ahead of the body parser
    ClsModule.forRoot({ global: true, middleware: { mount: false } }),
    LoggerModule,
    DatabaseModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [CLOCK],
})
export class SharedModule {}
