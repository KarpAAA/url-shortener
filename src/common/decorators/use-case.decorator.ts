import { Inject, Injectable } from '@nestjs/common';

import type { Logger } from '@shared/logger/logger';
import { LOGGER } from '@shared/logger/logger';

const LOGGER_PROPERTY = '__useCaseLogger';

type Execute = (...args: unknown[]) => Promise<unknown>;
interface UseCasePrototype {
  execute: Execute;
}
type UseCaseInstance = Partial<Record<typeof LOGGER_PROPERTY, Logger>>;

const outcomeOf = (err: unknown): string => {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'error';
};

/**
 * Marks a use case: registers it as a provider and logs one line per `execute` —
 * name, duration, outcome (`ok` or the error code). Use cases never hand-write that line.
 * The logger is property-injected so the constructor shows only what the operation needs;
 * constructed by hand (unit tests) there is no logger and nothing is logged.
 */
export function UseCase(): ClassDecorator {
  return (target) => {
    Injectable()(target);
    Inject(LOGGER)(target.prototype as object, LOGGER_PROPERTY);

    const prototype = target.prototype as UseCasePrototype;
    const original = prototype.execute;
    const useCase = target.name;

    prototype.execute = async function (this: UseCaseInstance, ...args: unknown[]) {
      const startedAt = performance.now();
      const log = (outcome: string): void => {
        const durationMs = Math.round(performance.now() - startedAt);
        this[LOGGER_PROPERTY]?.info({ useCase, durationMs, outcome }, 'use case executed');
      };
      try {
        const result = await original.apply(this, args);
        log('ok');
        return result;
      } catch (err) {
        log(outcomeOf(err));
        throw err;
      }
    };
  };
}
