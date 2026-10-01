import { Inject, Injectable, type LoggerService } from '@nestjs/common';

import { LOGGER, type Logger } from '@shared/logger/logger';

/** Routes Nest's own log lines (bootstrap, route mapping, Terminus) through the app logger. */
@Injectable()
export class NestLoggerAdapter implements LoggerService {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  log(message: unknown, ...rest: unknown[]): void {
    this.logger.info(this.fields(rest), this.text(message));
  }

  warn(message: unknown, ...rest: unknown[]): void {
    this.logger.warn(this.fields(rest), this.text(message));
  }

  error(message: unknown, ...rest: unknown[]): void {
    const err = message instanceof Error ? message : undefined;
    this.logger.error({ ...this.fields(rest), ...(err && { err }) }, this.text(message));
  }

  debug(message: unknown, ...rest: unknown[]): void {
    this.logger.debug(this.fields(rest), this.text(message));
  }

  verbose(message: unknown, ...rest: unknown[]): void {
    this.logger.debug(this.fields(rest), this.text(message));
  }

  /** Nest passes the context (the class name) as the last string argument. */
  private fields(rest: unknown[]): { context?: string } {
    const context = rest.at(-1);
    return typeof context === 'string' ? { context } : {};
  }

  private text(message: unknown): string {
    if (typeof message === 'string') return message;
    if (message instanceof Error) return message.message;
    return JSON.stringify(message);
  }
}
