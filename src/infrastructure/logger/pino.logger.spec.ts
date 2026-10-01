import { describe, expect, it } from 'vitest';

import { PinoLogger } from './pino.logger';

const capture = (
  correlationId: () => string | undefined = () => 'req-1',
  level = 'debug',
): { log: PinoLogger; lines: () => Record<string, unknown>[] } => {
  const written: string[] = [];
  const log = PinoLogger.create({
    level,
    pretty: false,
    service: 'url-shortener',
    correlationId,
    destination: { write: (chunk: string) => void written.push(chunk) },
  });
  return { log, lines: () => written.map((line) => JSON.parse(line) as Record<string, unknown>) };
};

describe('PinoLogger', () => {
  it('R-42 writes one JSON object per line with level, time, message and fields', () => {
    const { log, lines } = capture();

    log.info({ route: '/:code', status: 302 }, 'request completed');

    expect(lines()).toEqual([
      {
        level: 'info',
        time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) as string,
        service: 'url-shortener',
        correlationId: 'req-1',
        route: '/:code',
        status: 302,
        msg: 'request completed',
      },
    ]);
  });

  it('R-42 adds the correlation id of the current request to every line', () => {
    let current: string | undefined = 'first';
    const { log, lines } = capture(() => current);

    log.info({}, 'a');
    current = 'second';
    log.warn({}, 'b');
    current = undefined;
    log.info({}, 'c');

    expect(lines().map((line) => line.correlationId)).toEqual(['first', 'second', undefined]);
  });

  it.each(['authorization', 'cookie', 'password', 'token', 'secret', 'apiKey'])(
    'R-42 redacts %s at the top level and when nested',
    (key) => {
      const { log, lines } = capture();

      log.info(
        { [key]: 'hunter2', headers: { [key]: 'hunter2' }, a: { b: { [key]: 'hunter2' } } },
        'x',
      );

      expect(JSON.stringify(lines())).not.toContain('hunter2');
      expect(lines()[0]).toMatchObject({
        [key]: '[REDACTED]',
        headers: { [key]: '[REDACTED]' },
        a: { b: { [key]: '[REDACTED]' } },
      });
    },
  );

  it('R-42 serialises an error under `err` with its type, message and stack', () => {
    const { log, lines } = capture();

    log.error({ err: new TypeError('boom') }, 'request failed');

    expect(lines()[0]).toMatchObject({
      level: 'error',
      msg: 'request failed',
      err: {
        type: 'TypeError',
        message: 'boom',
        stack: expect.stringContaining('TypeError: boom') as string,
      },
    });
  });

  it('R-42 drops lines below the configured level', () => {
    const { log, lines } = capture(() => undefined, 'warn');

    log.debug({}, 'debug');
    log.info({}, 'info');
    log.warn({}, 'warn');
    log.error({}, 'error');

    expect(lines().map((line) => line.level)).toEqual(['warn', 'error']);
  });

  it('R-42 a child logger keeps its bindings and still carries the correlation id', () => {
    const { log, lines } = capture();

    log.child({ component: 'prisma' }).debug({ durationMs: 3 }, 'query');

    expect(lines()[0]).toMatchObject({
      component: 'prisma',
      correlationId: 'req-1',
      durationMs: 3,
    });
  });
});
