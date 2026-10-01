import { ClsMiddleware } from 'nestjs-cls';

import { newId } from '@shared/domain/id';

import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_HEADER = 'x-correlation-id';

/** A client-supplied id is echoed into logs and a header, so its alphabet is restricted. */
const ACCEPTABLE_ID = /^[A-Za-z0-9._-]{1,128}$/;

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

/**
 * Opens the request context: takes `x-correlation-id` from the client or generates one,
 * returns it on every response, and sets the API-wide `Cache-Control: no-store` default.
 * Mounted before the body parser so that even a malformed body is answered with an id.
 */
export function correlationMiddleware(): Middleware {
  const cls = new ClsMiddleware({
    generateId: true,
    idGenerator: (req: Request) => {
      const supplied = req.header(CORRELATION_HEADER);
      return supplied !== undefined && ACCEPTABLE_ID.test(supplied) ? supplied : newId();
    },
    setup: (store, _req: Request, res: Response) => {
      res.setHeader(CORRELATION_HEADER, store.getId());
      res.setHeader('Cache-Control', 'no-store');
    },
  });
  return (req, res, next) => {
    void cls.use(req, res, next);
  };
}
