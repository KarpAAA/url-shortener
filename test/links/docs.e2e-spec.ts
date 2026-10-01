import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from '../setup/app';

interface Operation {
  operationId: string;
  summary?: string;
  tags?: string[];
  requestBody?: { content: Record<string, { schema: unknown }> };
  responses: Record<string, { description: string; content?: Record<string, ResponseContent> }>;
}
interface ResponseContent {
  schema: { $ref?: string };
  examples?: Record<string, { value: Record<string, unknown> }>;
}
interface OpenApi {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, Operation>>;
  components: {
    schemas: Record<
      string,
      { properties: Record<string, Record<string, unknown>>; required?: string[] }
    >;
  };
}

let ctx: TestApp;
let doc: OpenApi;

beforeAll(async () => {
  ctx = await createTestApp();
  doc = (await ctx.http.get('/docs-json').expect(200)).body as OpenApi;
});

afterAll(async () => {
  await ctx.close();
});

const operations = (): [string, Operation][] =>
  Object.entries(doc.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, op]): [string, Operation] => [
      `${method.toUpperCase()} ${path}`,
      op,
    ]),
  );

describe('OpenAPI', () => {
  it('R-36 serves the document at /docs-json and Swagger UI at /docs', async () => {
    const ui = await ctx.http.get('/docs').expect(200);

    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBe('URL shortener');
    expect(ui.headers['content-type']).toMatch(/^text\/html/);
    expect(ui.text).toContain('swagger-ui');
  });

  it('R-36 documents exactly the three endpoints of the API', () => {
    expect(
      operations()
        .map(([name]) => name)
        .sort(),
    ).toEqual(['GET /stats/{code}', 'GET /{code}', 'POST /shorten']);
  });

  it('R-36 gives every operation a summary, a tag and a client-friendly operationId', () => {
    for (const [, op] of operations()) {
      expect(op.summary).toBeTruthy();
      expect(op.tags).toEqual(['links']);
    }
    expect(
      operations()
        .map(([, op]) => op.operationId)
        .sort(),
    ).toEqual(['getStats', 'redirect', 'shortenUrl']);
  });

  it.each([
    ['POST /shorten', ['201', '400', '413', '429', '503']],
    ['GET /{code}', ['302', '404']],
    ['GET /stats/{code}', ['200', '404']],
  ])('R-36 %s documents its success and error responses', (name, statuses) => {
    const op = Object.fromEntries(operations())[name];

    expect(Object.keys(op?.responses ?? {}).sort()).toEqual(statuses);
  });

  it('R-36 describes every error response as problem+json with an example', () => {
    for (const [name, op] of operations()) {
      for (const [status, response] of Object.entries(op.responses)) {
        if (Number(status) < 400) continue;
        const content = response.content?.['application/problem+json'];

        expect(content?.schema.$ref, `${name} ${status}`).toBe(
          '#/components/schemas/ProblemDetailsDto',
        );
        const examples = Object.values(content?.examples ?? {});
        expect(examples.length, `${name} ${status}`).toBeGreaterThan(0);
        for (const example of examples) {
          expect(example.value).toMatchObject({ type: 'about:blank', status: Number(status) });
          expect(typeof example.value.code).toBe('string');
        }
      }
    }
  });

  it('R-36 gives request and response fields examples and constraints', () => {
    const { ShortenUrlDto, ShortLinkDto, LinkStatsDto, ProblemDetailsDto } = doc.components.schemas;

    expect(ShortenUrlDto?.required).toEqual(['url']);
    expect(ShortenUrlDto?.properties.url).toMatchObject({
      type: 'string',
      maxLength: 2048,
      example: expect.stringMatching(/^https:\/\//) as string,
    });
    expect(ShortLinkDto?.required?.sort()).toEqual([
      'code',
      'createdAt',
      'originalUrl',
      'shortUrl',
    ]);
    expect(ShortLinkDto?.properties.code).toMatchObject({ pattern: '^[0-9A-Za-z]{7}$' });
    expect(LinkStatsDto?.required?.sort()).toEqual([
      'code',
      'createdAt',
      'lastVisitedAt',
      'originalUrl',
      'visits',
    ]);
    expect(LinkStatsDto?.properties.lastVisitedAt).toMatchObject({ nullable: true });
    expect(ProblemDetailsDto?.required?.sort()).toEqual([
      'code',
      'correlationId',
      'detail',
      'instance',
      'status',
      'title',
      'type',
    ]);
  });

  it('R-36 links a created short link to its redirect and statistics operations', () => {
    const created = doc.paths['/shorten']?.post?.responses['201'] as unknown as {
      links: Record<string, { operationId: string; parameters: Record<string, string> }>;
    };

    expect(created.links).toMatchObject({
      redirect: { operationId: 'redirect', parameters: { code: '$response.body#/code' } },
      getStats: { operationId: 'getStats', parameters: { code: '$response.body#/code' } },
    });
  });

  it('R-36 keeps health endpoints out of the public contract', () => {
    expect(Object.keys(doc.paths).some((path) => path.startsWith('/health'))).toBe(false);
  });
});

describe('security headers', () => {
  it.each([
    ['a success response', '/health/live'],
    ['an error response', '/no/such/route'],
    ['a redirect', '/zzzzzz9'],
  ])('R-43 sets the baseline security headers on %s', async (_name, path) => {
    const res = await ctx.http.get(path);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
