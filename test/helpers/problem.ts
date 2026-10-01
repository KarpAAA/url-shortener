import { STATUS_CODES } from 'node:http';

import { expect } from 'vitest';

import type { Response } from 'supertest';

export interface ExpectedProblem {
  readonly status: number;
  readonly code: string;
  readonly instance: string;
  readonly detail?: string | RegExp;
}

/**
 * Asserts a complete RFC 9457 problem: media type, every standard member, the `code` and
 * `correlationId` extensions, and that nothing beyond the documented members is present.
 */
export function expectProblem(res: Response, expected: ExpectedProblem): void {
  const body = res.body as Record<string, unknown>;

  expect(res.status).toBe(expected.status);
  expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  expect(body).toMatchObject({
    type: 'about:blank',
    title: STATUS_CODES[expected.status],
    status: expected.status,
    code: expected.code,
    instance: expected.instance,
  });
  expect(typeof body.detail).toBe('string');
  if (expected.detail !== undefined) expect(body.detail).toMatch(expected.detail);
  expect(body.correlationId).toBe(res.headers['x-correlation-id']);
  expect(typeof body.correlationId).toBe('string');

  const allowed = [
    'type',
    'title',
    'status',
    'detail',
    'instance',
    'code',
    'correlationId',
    'errors',
  ];
  expect(Object.keys(body).filter((key) => !allowed.includes(key))).toEqual([]);
  expect(JSON.stringify(body)).not.toMatch(/\bat .+:\d+:\d+|node_modules|prisma|postgres/i);
}
