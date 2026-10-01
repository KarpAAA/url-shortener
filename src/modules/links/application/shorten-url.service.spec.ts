import { describe, expect, it } from 'vitest';

import { InvalidUrlError, ShortCodeAllocationError, ShortCodeTakenError } from '../domain/errors';

import { useCases } from './__test__/fixtures';
import { MAX_CODE_ATTEMPTS } from './shorten-url.service';

const URL = 'https://example.com/a/long/path?with=query';

describe('ShortenUrlService', () => {
  it('R-01 stores the link under the generated code and returns that code', async () => {
    const { shorten, links, clock } = useCases(['aB3xY9z']);

    const result = await shorten.execute({ url: URL });

    expect(result).toEqual({ code: 'aB3xY9z' });
    const stored = links.find('aB3xY9z');
    expect(stored?.originalUrl.href).toBe(URL);
    expect(stored?.visits).toBe(0n);
    expect(stored?.createdAt).toEqual(clock.now());
    expect(stored?.lastVisitedAt).toBeNull();
  });

  it('R-10 stores the normalised form of the URL', async () => {
    const { shorten, links } = useCases(['aB3xY9z']);

    await shorten.execute({ url: 'HTTPS://EXAMPLE.COM:443/Path' });

    expect(links.find('aB3xY9z')?.originalUrl.href).toBe('https://example.com/Path');
  });

  it.each([
    ['an unsupported scheme', 'javascript:alert(1)', 'unsupported_scheme'],
    ['a malformed URL', 'not a url', 'malformed'],
    ['credentials', 'https://user:pass@example.com/', 'credentials'],
    ['the own host of the service', 'https://sho.rt/abc1234', 'self_reference'],
  ])('R-05 R-08 R-09 rejects %s and stores nothing', async (_name, url, reason) => {
    const { shorten, links, codes } = useCases();

    await expect(shorten.execute({ url })).rejects.toMatchObject({
      constructor: InvalidUrlError,
      reason,
    });
    expect(links.size).toBe(0);
    expect(codes.generated).toBe(0);
  });

  it('R-14 shortening the same URL twice creates two independent links', async () => {
    const { shorten, links } = useCases();

    const first = await shorten.execute({ url: URL });
    const second = await shorten.execute({ url: URL });

    expect(first.code).not.toBe(second.code);
    expect(links.size).toBe(2);
    expect(links.find(first.code)?.id).not.toBe(links.find(second.code)?.id);
  });

  it('R-18 draws another code when the first one is taken', async () => {
    const { shorten, links, codes } = useCases(['taken01', 'taken01', 'free001']);
    await shorten.execute({ url: 'https://example.com/first' });

    const result = await shorten.execute({ url: URL });

    expect(result).toEqual({ code: 'free001' });
    expect(codes.generated).toBe(3);
    expect(links.find('taken01')?.originalUrl.href).toBe('https://example.com/first');
    expect(links.find('free001')?.originalUrl.href).toBe(URL);
  });

  it.each([1, 2, 3, MAX_CODE_ATTEMPTS - 1])(
    'R-18 succeeds after %i consecutive collisions, within the attempt limit',
    async (collisions) => {
      const taken = Array.from({ length: collisions }, () => 'taken01');
      const { shorten, links, codes } = useCases(['taken01', ...taken, 'free001']);
      await shorten.execute({ url: 'https://example.com/first' });

      const result = await shorten.execute({ url: URL });

      expect(result).toEqual({ code: 'free001' });
      expect(codes.generated).toBe(1 + collisions + 1);
      expect(links.size).toBe(2);
    },
  );

  it('R-19 gives up with a controlled error after the attempt limit', async () => {
    const taken = Array.from({ length: MAX_CODE_ATTEMPTS }, () => 'taken01');
    const { shorten, links, codes } = useCases(['taken01', ...taken, 'free001']);
    await shorten.execute({ url: 'https://example.com/first' });

    const failure = shorten.execute({ url: URL });

    await expect(failure).rejects.toBeInstanceOf(ShortCodeAllocationError);
    await expect(failure).rejects.toMatchObject({
      code: 'SHORT_CODE_ALLOCATION_FAILED',
      retryable: true,
      attempts: MAX_CODE_ATTEMPTS,
    });
    expect(codes.generated).toBe(1 + MAX_CODE_ATTEMPTS);
    expect(links.size).toBe(1);
    expect(links.find('free001')).toBeUndefined();
  });

  it('R-19 the attempt limit is 5', () => {
    expect(MAX_CODE_ATTEMPTS).toBe(5);
  });

  it('R-18 does not retry a failure that is not a code collision', async () => {
    const { shorten, links, codes } = useCases();
    const outage = new Error('connection refused');
    links.failNextInsert(outage);

    await expect(shorten.execute({ url: URL })).rejects.toBe(outage);
    expect(codes.generated).toBe(1);
    expect(links.size).toBe(0);
  });

  it('R-18 a collision reported by the repository is retried exactly like a taken code', async () => {
    const { shorten, links, codes } = useCases();
    links.failNextInsert(new ShortCodeTakenError());

    const result = await shorten.execute({ url: URL });

    expect(codes.generated).toBe(2);
    expect(links.find(result.code)?.originalUrl.href).toBe(URL);
  });

  it('R-01 stamps each link with the time of its own request', async () => {
    const { shorten, links, clock } = useCases(['first01', 'second1']);
    const firstAt = clock.now();

    await shorten.execute({ url: URL });
    clock.advance(5000);
    await shorten.execute({ url: URL });

    expect(links.find('first01')?.createdAt).toEqual(firstAt);
    expect(links.find('second1')?.createdAt).toEqual(new Date(firstAt.getTime() + 5000));
  });
});
