import pino, { type DestinationStream, type Logger as Pino } from 'pino';

import type { Logger } from '@shared/logger/logger';

const SENSITIVE_KEYS = ['authorization', 'cookie', 'password', 'token', 'secret', 'apiKey'];
const REDACT_DEPTH = 3;

/** pino has no "any depth" wildcard, so the keys are listed for each nesting level. */
export const REDACT_PATHS: readonly string[] = SENSITIVE_KEYS.flatMap((key) =>
  Array.from({ length: REDACT_DEPTH + 1 }, (_, depth) =>
    [...Array<string>(depth).fill('*'), key].join('.'),
  ),
);

export interface PinoLoggerOptions {
  readonly level: string;
  readonly pretty: boolean;
  readonly service: string;
  /** Id of the current request, if any; added to every line. */
  readonly correlationId: () => string | undefined;
  /** Where to write; stdout when omitted. Tests pass a capturing stream. */
  readonly destination?: DestinationStream;
}

/** JSON logger: level as a label, ISO time, correlation id from the request context. */
export class PinoLogger implements Logger {
  private constructor(private readonly pino: Pino) {}

  static create(options: PinoLoggerOptions): PinoLogger {
    const instance = pino(
      {
        level: options.level,
        base: { service: options.service },
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: { level: (label) => ({ level: label }) },
        redact: { paths: [...REDACT_PATHS], censor: '[REDACTED]' },
        mixin: () => {
          const correlationId = options.correlationId();
          return correlationId === undefined ? {} : { correlationId };
        },
        ...(options.pretty && { transport: { target: 'pino-pretty' } }),
      },
      options.destination,
    );
    return new PinoLogger(instance);
  }

  debug(obj: object, msg: string): void {
    this.pino.debug(obj, msg);
  }

  info(obj: object, msg: string): void {
    this.pino.info(obj, msg);
  }

  warn(obj: object, msg: string): void {
    this.pino.warn(obj, msg);
  }

  error(obj: { err?: unknown; [field: string]: unknown }, msg: string): void {
    this.pino.error(obj, msg);
  }

  child(bindings: object): Logger {
    return new PinoLogger(this.pino.child(bindings));
  }
}
