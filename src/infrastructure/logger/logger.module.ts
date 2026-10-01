import { Global, Module } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { appConfig, type AppConfig } from '@config/app.config';
import { loggingConfig, type LoggingConfig } from '@config/logging.config';
import { LOGGER, type Logger } from '@shared/logger/logger';

import { NestLoggerAdapter } from './nest-logger.adapter';
import { PinoLogger } from './pino.logger';

@Global()
@Module({
  providers: [
    {
      provide: LOGGER,
      inject: [loggingConfig.KEY, appConfig.KEY, ClsService],
      useFactory: (logging: LoggingConfig, app: AppConfig, cls: ClsService): Logger =>
        PinoLogger.create({
          level: logging.level,
          pretty: logging.pretty,
          service: app.name,
          correlationId: () => (cls.isActive() ? cls.getId() : undefined),
        }),
    },
    NestLoggerAdapter,
  ],
  exports: [LOGGER, NestLoggerAdapter],
})
export class LoggerModule {}
