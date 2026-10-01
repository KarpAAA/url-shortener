import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { appConfig } from './app.config';
import { databaseConfig } from './database.config';
import { validateEnv } from './env';
import { httpConfig } from './http.config';
import { loggingConfig } from './logging.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      load: [appConfig, databaseConfig, loggingConfig, httpConfig],
    }),
  ],
})
export class AppConfigModule {}
