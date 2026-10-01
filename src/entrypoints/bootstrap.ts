import { type Type, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { bodyParserErrors } from '@common/middleware/body-parser-errors';
import { correlationMiddleware } from '@common/middleware/correlation';
import { requestLogger } from '@common/middleware/request-logger';
import { validationExceptionFactory } from '@common/pipes/validation-exception.factory';
import { setupSwagger } from '@common/swagger/setup-swagger';
import { appConfig, type AppConfig } from '@config/app.config';
import { httpConfig, type HttpConfig } from '@config/http.config';
import { NestLoggerAdapter } from '@infra/logger/nest-logger.adapter';
import { LOGGER, type Logger } from '@shared/logger/logger';

import type { NestExpressApplication } from '@nestjs/platform-express';

/** `bodyParser: false`: the parser is mounted by hand, after the request context. */
export const API_APP_OPTIONS = { bufferLogs: true, bodyParser: false } as const;

/**
 * Everything the `api` process adds on top of the module graph. Shared by `main.api.ts`
 * and the e2e suite, so tests exercise the same pipeline as production.
 */
export function configureApiApp(app: NestExpressApplication): void {
  const config = app.get<AppConfig>(appConfig.KEY);
  const http = app.get<HttpConfig>(httpConfig.KEY);

  app.useLogger(app.get(NestLoggerAdapter));
  app.set('trust proxy', config.trustProxyHops);
  // every response is `no-store`; an ETag would only cost a hash per response
  app.set('etag', false);
  // API only: a CSP protects nothing on JSON and breaks Swagger UI
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(correlationMiddleware());
  app.use(requestLogger(app.get<Logger>(LOGGER)));
  app.useBodyParser('json', { limit: http.jsonBodyLimit });
  app.use(bodyParserErrors());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.enableShutdownHooks();
  setupSwagger(app);
}

export async function bootstrap(module: Type): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(module, API_APP_OPTIONS);
  configureApiApp(app);
  const { port } = app.get<AppConfig>(appConfig.KEY);
  await app.listen(port);
  app.get<Logger>(LOGGER).info({ port }, 'api listening');
}
