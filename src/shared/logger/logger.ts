/** Structured logger: fields first, constant message second. Implemented in `infrastructure/logger`. */
export interface Logger {
  debug(obj: object, msg: string): void;
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: { err?: unknown; [field: string]: unknown }, msg: string): void;
  child(bindings: object): Logger;
}

export const LOGGER = Symbol('LOGGER');
