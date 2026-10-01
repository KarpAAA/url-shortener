import { type ConfigType, registerAs } from '@nestjs/config';

import { env } from './env';

export const loggingConfig = registerAs('logging', () => ({
  level: env().LOG_LEVEL,
  pretty: env().LOG_PRETTY,
}));

export type LoggingConfig = ConfigType<typeof loggingConfig>;
