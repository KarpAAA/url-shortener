import { describe, expect, it, vi } from 'vitest';

import { LinkNotFoundError } from '../domain/errors';

import { useCases } from './__test__/fixtures';

const URL = 'https://example.com/destination';

describe('ResolveLinkService', () => {
  it('R-21 returns the destination of an existing code', async () => {
    const { shorten, resolve } = useCases(['aB3xY9z']);
    await shorten.execute({ url: URL });

    await expect(resolve.execute({ code: 'aB3xY9z' })).resolves.toEqual({ url: URL });
  });

  it('R-26 counts one visit per resolution and records when it happened', async () => {
    const { shorten, resolve, links, clock } = useCases(['aB3xY9z']);
    await shorten.execute({ url: URL });

    clock.advance(60_000);
    await resolve.execute({ code: 'aB3xY9z' });
    const firstVisitAt = clock.now();
    clock.advance(60_000);
    await resolve.execute({ code: 'aB3xY9z' });

    expect(links.find('aB3xY9z')?.visits).toBe(2n);
    expect(links.find('aB3xY9z')?.lastVisitedAt).toEqual(new Date(firstVisitAt.getTime() + 60_000));
  });

  it('R-26 counts visits per link, not globally', async () => {
    const { shorten, resolve, links } = useCases(['first01', 'second1']);
    await shorten.execute({ url: URL });
    await shorten.execute({ url: URL });

    await resolve.execute({ code: 'first01' });

    expect(links.find('first01')?.visits).toBe(1n);
    expect(links.find('second1')?.visits).toBe(0n);
    expect(links.find('second1')?.lastVisitedAt).toBeNull();
  });

  it('R-23 reports an unknown code as not found', async () => {
    const { resolve } = useCases();

    await expect(resolve.execute({ code: 'unknown' })).rejects.toBeInstanceOf(LinkNotFoundError);
  });

  it.each([
    ['too short', 'abc'],
    ['too long', 'abcdefgh'],
    ['with a forbidden character', 'abc-123'],
    ['a reserved word', 'shorten'],
    ['empty', ''],
  ])(
    'R-24 reports a code that is %s as not found without asking the repository',
    async (_n, code) => {
      const { resolve, links } = useCases();
      const registerVisit = vi.spyOn(links, 'registerVisit');

      await expect(resolve.execute({ code })).rejects.toBeInstanceOf(LinkNotFoundError);
      expect(registerVisit).not.toHaveBeenCalled();
    },
  );

  it('R-24 asks the repository exactly once for a well-formed code', async () => {
    const { shorten, resolve, links } = useCases(['aB3xY9z']);
    await shorten.execute({ url: URL });
    const registerVisit = vi.spyOn(links, 'registerVisit');

    await resolve.execute({ code: 'aB3xY9z' });

    expect(registerVisit).toHaveBeenCalledTimes(1);
  });
});
