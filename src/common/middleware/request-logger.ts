import { AsyncLocalStorage } from 'node:async_hooks';

import type { Logger } from '@shared/logger/logger';

import type { NextFunction, Request, Response } from 'express';

const SILENT_PREFIXES = ['/health'];

const routeOf = (req: Request): string => {
  const route = req.route as { path?: unknown } | undefined;
  // the pattern, never the URL: `/:code` keeps log cardinality bounded
  return typeof route?.path === 'string' ? route.path : 'unmatched';
};

/** One line per HTTP request, at completion: method, route pattern, status, duration. */
export function requestLogger(log: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (SILENT_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
      next();
      return;
    }
    const startedAt = performance.now();
    res.once(
      'finish',
      // bound: the listener must log with this request's correlation id
      AsyncLocalStorage.bind(() => {
        log.info(
          {
            method: req.method,
            route: routeOf(req),
            status: res.statusCode,
            durationMs: Math.round(performance.now() - startedAt),
          },
          'request completed',
        );
      }),
    );
    next();
  };
}
