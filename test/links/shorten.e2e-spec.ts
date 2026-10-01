import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expectProblem } from '../helpers/problem';
import { createTestApp, type TestApp } from '../setup/app';

const CODE = /^[0-9A-Za-z]{7}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LONG_URL = 'https://example.com/some/very/long/path?utm_source=newsletter&utm_medium=email';

interface ShortLinkBody {
  code: string;
  shortUrl: string;
  originalUrl: string;
  createdAt: string;
}

let ctx: TestApp;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

const shorten = (body: unknown) => ctx.http.post('/shorten').send(body as object);

describe('POST /shorten', () => {
  it('R-01 creates a short link and returns code, shortUrl, originalUrl and createdAt', async () => {
    const before = Date.now();

    const res = await shorten({ url: LONG_URL }).expect(201);
    const body = res.body as ShortLinkBody;

    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(Object.keys(body).sort()).toEqual(['code', 'createdAt', 'originalUrl', 'shortUrl']);
    expect(body.code).toMatch(CODE);
    expect(body.shortUrl).toBe(`http://short.test/${body.code}`);
    expect(body.originalUrl).toBe(LONG_URL);
    expect(body.createdAt).toMatch(ISO_DATE);
    expect(Date.parse(body.createdAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(body.createdAt)).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('R-01 persists the link with no visits', async () => {
    const res = await shorten({ url: LONG_URL }).expect(201);
    const { code } = res.body as ShortLinkBody;

    const rows = await ctx.db.query('SELECT * FROM links WHERE code = $1', [code]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code,
      original_url: LONG_URL,
      visits: '0',
      last_visited_at: null,
    });
    expect(rows[0]?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
  });

  it('R-02 points Location at the statistics resource of the new link', async () => {
    const res = await shorten({ url: LONG_URL }).expect(201);

    expect(res.headers.location).toBe(`/stats/${(res.body as ShortLinkBody).code}`);
  });

  it('R-10 returns and stores the normalised URL', async () => {
    const res = await shorten({ url: 'HTTPS://Приклад.Укр:443/шлях?q=так' }).expect(201);

    expect((res.body as ShortLinkBody).originalUrl).toBe(
      'https://xn--80aikifvh.xn--j1amh/%D1%88%D0%BB%D1%8F%D1%85?q=%D1%82%D0%B0%D0%BA',
    );
  });

  it('R-14 shortening the same URL again creates another link with its own code', async () => {
    const first = (await shorten({ url: LONG_URL }).expect(201)).body as ShortLinkBody;
    const second = (await shorten({ url: LONG_URL }).expect(201)).body as ShortLinkBody;

    expect(second.code).not.toBe(first.code);
    expect(second.originalUrl).toBe(first.originalUrl);
  });

  it('R-07 accepts a URL of exactly 2048 characters', async () => {
    const url = `https://example.com/${'a'.repeat(2048 - 'https://example.com/'.length)}`;

    const res = await shorten({ url }).expect(201);

    expect((res.body as ShortLinkBody).originalUrl).toHaveLength(2048);
  });
});

describe('POST /shorten — body shape (400 VALIDATION_FAILED)', () => {
  it.each([
    ['missing', {}, ['isString', 'isNotEmpty', 'maxLength']],
    ['null', { url: null }, ['isString', 'isNotEmpty', 'maxLength']],
    ['a number', { url: 42 }, ['isString', 'maxLength']],
    ['a boolean', { url: true }, ['isString', 'maxLength']],
    ['an object', { url: { href: LONG_URL } }, ['isString', 'maxLength']],
    ['an array', { url: [LONG_URL] }, ['isString', 'maxLength']],
    ['an empty string', { url: '' }, ['isNotEmpty']],
  ])('R-03 rejects a url that is %s and names the field', async (_name, body, codes) => {
    const res = await shorten(body);

    expectProblem(res, { status: 400, code: 'VALIDATION_FAILED', instance: '/shorten' });
    const errors = (res.body as { errors: { path: string; code: string; message: string }[] })
      .errors;
    expect(errors.every((error) => error.path === 'url')).toBe(true);
    expect(errors.map((error) => error.code).sort()).toEqual([...codes].sort());
    expect(errors.every((error) => typeof error.message === 'string')).toBe(true);
  });

  it('R-04 rejects a field the API does not know', async () => {
    const res = await shorten({ url: LONG_URL, alias: 'mine' });

    expectProblem(res, { status: 400, code: 'VALIDATION_FAILED', instance: '/shorten' });
    expect((res.body as { errors: unknown[] }).errors).toEqual([
      { path: 'alias', code: 'whitelistValidation', message: 'property alias should not exist' },
    ]);
  });

  it('R-07 rejects a URL longer than 2048 characters', async () => {
    const res = await shorten({ url: `https://example.com/${'a'.repeat(2048)}` });

    expectProblem(res, { status: 400, code: 'VALIDATION_FAILED', instance: '/shorten' });
    expect((res.body as { errors: { code: string }[] }).errors.map((e) => e.code)).toEqual([
      'maxLength',
    ]);
  });

  it.each([
    ['an array', []],
    ['an array of objects', [{ url: LONG_URL }]],
  ])('R-12 rejects a body that is %s instead of an object', async (_name, body) => {
    const res = await shorten(body);

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  });

  it('R-03 creates nothing when the body is rejected', async () => {
    const [{ count: before } = { count: '0' }] = await ctx.db.query<{ count: string }>(
      'SELECT count(*) FROM links',
    );

    await shorten({ url: 42 }).expect(400);
    await shorten({ url: 'javascript:alert(1)' }).expect(400);

    const [{ count: after } = { count: '-1' }] = await ctx.db.query<{ count: string }>(
      'SELECT count(*) FROM links',
    );
    expect(after).toBe(before);
  });
});

describe('POST /shorten — URL rules (400 INVALID_URL)', () => {
  it.each([
    ['javascript:', 'javascript:alert(document.cookie)', /scheme must be http or https/],
    ['data:', 'data:text/html;base64,PHNjcmlwdD4=', /scheme must be http or https/],
    ['file:', 'file:///etc/passwd', /scheme must be http or https/],
    ['ftp:', 'ftp://example.com/file.zip', /scheme must be http or https/],
    ['mailto:', 'mailto:someone@example.com', /scheme must be http or https/],
  ])('R-05 rejects the %s scheme', async (_name, url, detail) => {
    expectProblem(await shorten({ url }), {
      status: 400,
      code: 'INVALID_URL',
      instance: '/shorten',
      detail,
    });
  });

  it.each([
    ['no scheme', 'example.com/path'],
    ['a relative path', '/just/a/path'],
    ['no host', 'https://'],
    ['plain text', 'not a url at all'],
    ['whitespace only', '   '],
  ])('R-06 rejects a URL with %s', async (_name, url) => {
    expectProblem(await shorten({ url }), {
      status: 400,
      code: 'INVALID_URL',
      instance: '/shorten',
    });
  });

  it('R-08 rejects a URL with credentials', async () => {
    expectProblem(await shorten({ url: 'https://admin:hunter2@example.com/' }), {
      status: 400,
      code: 'INVALID_URL',
      instance: '/shorten',
      detail: /must not contain a username or password/,
    });
  });

  it.each([
    'http://short.test/aB3xY9z',
    'https://short.test/',
    'http://SHORT.TEST/stats/aB3xY9z',
    'http://short.test./aB3xY9z',
  ])('R-09 rejects a link to the service itself: %s', async (url) => {
    expectProblem(await shorten({ url }), {
      status: 400,
      code: 'INVALID_URL',
      instance: '/shorten',
      detail: /must not point to this service/,
    });
  });

  it('R-07 rejects a URL that exceeds the limit only after percent-encoding', async () => {
    expectProblem(await shorten({ url: `https://example.com/${'я'.repeat(1000)}` }), {
      status: 400,
      code: 'INVALID_URL',
      instance: '/shorten',
      detail: /longer than the maximum/,
    });
  });
});

describe('POST /shorten — malformed requests never become a 500', () => {
  it.each([
    ['truncated JSON', '{"url": "https://example.com"'],
    ['a trailing comma', '{"url": "https://example.com",}'],
    ['single quotes', "{'url': 'https://example.com'}"],
    ['a bare string', '"https://example.com"'],
    ['a bare number', '42'],
    ['the literal null', 'null'],
    ['garbage', '\u0000\u0001not json'],
  ])('R-12 answers 400 MALFORMED_JSON to %s', async (_name, raw) => {
    const res = await ctx.http.post('/shorten').set('Content-Type', 'application/json').send(raw);

    expectProblem(res, {
      status: 400,
      code: 'MALFORMED_JSON',
      instance: '/shorten',
      detail: 'Request body is not valid JSON',
    });
  });

  it('R-12 answers 400 to an empty body', async () => {
    const res = await ctx.http.post('/shorten').set('Content-Type', 'application/json').send('');

    expectProblem(res, { status: 400, code: 'VALIDATION_FAILED', instance: '/shorten' });
  });

  it('R-12 answers 400 to a request with no body and no content type', async () => {
    const res = await ctx.http.post('/shorten');

    expectProblem(res, { status: 400, code: 'VALIDATION_FAILED', instance: '/shorten' });
  });

  it.each([
    ['text/plain', LONG_URL],
    ['application/x-www-form-urlencoded', `url=${encodeURIComponent(LONG_URL)}`],
    ['application/xml', `<url>${LONG_URL}</url>`],
    [
      'multipart/form-data; boundary=x',
      `--x\r\nContent-Disposition: form-data; name="url"\r\n\r\n${LONG_URL}\r\n--x--`,
    ],
  ])('R-12 answers 400 to a body sent as %s', async (contentType, raw) => {
    const res = await ctx.http.post('/shorten').set('Content-Type', contentType).send(raw);

    expectProblem(res, { status: 400, code: 'VALIDATION_FAILED', instance: '/shorten' });
  });

  it('R-12 answers 415 to JSON in a charset the server cannot decode', async () => {
    const res = await ctx.http
      .post('/shorten')
      .set('Content-Type', 'application/json; charset=klingon')
      .send(JSON.stringify({ url: LONG_URL }));

    expectProblem(res, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', instance: '/shorten' });
  });

  it('R-13 answers 413 to a body larger than 10 kB', async () => {
    const res = await shorten({ url: `https://example.com/${'a'.repeat(11_000)}` });

    expectProblem(res, {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      instance: '/shorten',
      detail: 'Request body is too large',
    });
  });
});
