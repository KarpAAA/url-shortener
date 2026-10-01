import { describe, expect, it } from 'vitest';

import { NO_OWN_HOSTS, OWN_HOST_RULES } from './__test__/builders';
import { InvalidUrlError, type InvalidUrlReason } from './errors';
import { MAX_URL_LENGTH, OriginalUrl } from './original-url';

const reasonOf = (raw: unknown, rules = OWN_HOST_RULES): InvalidUrlReason | 'accepted' => {
  try {
    OriginalUrl.parse(raw, rules);
    return 'accepted';
  } catch (err) {
    if (err instanceof InvalidUrlError) return err.reason;
    throw err;
  }
};

describe('OriginalUrl.parse', () => {
  it.each([
    ['plain https', 'https://example.com', 'https://example.com/'],
    ['plain http', 'http://example.com/path', 'http://example.com/path'],
    [
      'query and fragment',
      'https://example.com/a?b=1&c=2#top',
      'https://example.com/a?b=1&c=2#top',
    ],
    ['explicit port', 'https://example.com:8443/x', 'https://example.com:8443/x'],
    ['default port is dropped', 'https://example.com:443/x', 'https://example.com/x'],
    ['upper-case scheme and host', 'HTTPS://EXAMPLE.COM/Path', 'https://example.com/Path'],
    ['IPv4 host', 'http://192.168.1.10/admin', 'http://192.168.1.10/admin'],
    ['IPv6 host', 'http://[2001:db8::1]:8080/', 'http://[2001:db8::1]:8080/'],
    ['localhost on another port', 'http://localhost:8080/', 'http://localhost:8080/'],
    ['single-label host', 'http://intranet/wiki', 'http://intranet/wiki'],
    ['percent-encoded path', 'https://example.com/a%20b', 'https://example.com/a%20b'],
    ['space in path is encoded', 'https://example.com/a b', 'https://example.com/a%20b'],
    ['trailing whitespace is dropped', 'https://example.com/a \n', 'https://example.com/a'],
    ['mixed-case scheme', 'hTTpS://example.com/', 'https://example.com/'],
  ])('R-05 R-06 accepts %s', (_name, raw, href) => {
    expect(OriginalUrl.parse(raw, OWN_HOST_RULES).href).toBe(href);
  });

  it.each([
    ['IDN host becomes punycode', 'https://приклад.укр/шлях', 'https://xn--80aikifvh.xn--j1amh/'],
    ['emoji host', 'https://👍.example/', 'https://xn--yp8h.example/'],
    ['unicode query', 'https://example.com/?q=привіт', 'https://example.com/?q='],
  ])('R-10 accepts a unicode URL and stores it normalised: %s', (_name, raw, prefix) => {
    const { href } = OriginalUrl.parse(raw, OWN_HOST_RULES);

    expect(href.startsWith(prefix)).toBe(true);

    expect(href).toMatch(/^[\x00-\x7F]+$/);
  });

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['file:', 'file:///etc/passwd'],
    ['ftp:', 'ftp://example.com/file'],
    ['mailto:', 'mailto:someone@example.com'],
    ['ws:', 'ws://example.com/socket'],
    ['custom scheme', 'myapp://open/thing'],
    ['vbscript:', 'vbscript:msgbox(1)'],
  ])('R-05 rejects the %s scheme', (_name, raw) => {
    expect(reasonOf(raw)).toBe('unsupported_scheme');
  });

  it.each([
    ['no scheme', 'example.com/path'],
    ['protocol-relative', '//example.com/path'],
    ['relative path', '/just/a/path'],
    ['scheme only', 'https://'],
    ['empty host', 'http:///path'],
    ['scheme without slashes', 'http:example.com'],
    ['backslashes instead of slashes', 'http:\\\\example.com'],
    ['space in host', 'http://exa mple.com'],
    ['invalid port', 'http://example.com:99999/'],
    ['plain words', 'not a url'],
    ['a leading space', ' https://example.com'],
    ['a leading newline', '\nhttps://example.com'],
    ['a tab inside the scheme', 'ht\ttps://example.com'],
    ['a question mark instead of a host', 'https://?query'],
    ['a fragment instead of a host', 'https://#fragment'],
  ])('R-06 rejects a URL that is not absolute with a host: %s', (_name, raw) => {
    expect(reasonOf(raw)).toBe('malformed');
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   \t\n'],
  ])('R-03 rejects %s', (_name, raw) => {
    expect(reasonOf(raw)).toBe('empty');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['number', 42],
    ['object', { url: 'https://example.com' }],
    ['array', ['https://example.com']],
  ])('R-03 rejects a non-string value: %s', (_name, raw) => {
    expect(reasonOf(raw)).toBe('not_a_string');
  });

  describe('length limit', () => {
    const urlOfLength = (length: number): string => {
      const prefix = 'https://example.com/';
      return prefix + 'a'.repeat(length - prefix.length);
    };

    it('R-07 accepts a URL of exactly the maximum length', () => {
      expect(reasonOf(urlOfLength(MAX_URL_LENGTH))).toBe('accepted');
    });

    it('R-07 rejects a URL one character over the maximum length', () => {
      expect(reasonOf(urlOfLength(MAX_URL_LENGTH + 1))).toBe('too_long');
    });

    it('R-07 rejects a very long URL without parsing it', () => {
      expect(reasonOf(urlOfLength(1_000_000))).toBe('too_long');
    });

    it('R-07 measures the string as sent, including whitespace the parser would drop', () => {
      const raw = `${urlOfLength(MAX_URL_LENGTH)} `;

      expect(new URL(raw).href).toHaveLength(MAX_URL_LENGTH);
      expect(reasonOf(raw)).toBe('too_long');
    });

    it('R-07 rejects a URL that fits as typed but exceeds the limit once percent-encoded', () => {
      const raw = `https://example.com/${'я'.repeat(1000)}`;

      expect(raw.length).toBeLessThan(MAX_URL_LENGTH);
      expect(reasonOf(raw)).toBe('too_long');
    });
  });

  it.each([
    ['user and password', 'https://user:pass@example.com/'],
    ['user only', 'https://user@example.com/'],
    ['password only', 'https://:pass@example.com/'],
    ['look-alike host as user name', 'https://bank.com@evil.example/login'],
  ])('R-08 rejects a URL with credentials: %s', (_name, raw) => {
    expect(reasonOf(raw)).toBe('credentials');
  });

  it.each([
    ['same host', 'https://sho.rt/abc1234'],
    ['other scheme, same host', 'http://sho.rt/abc1234'],
    ['upper-case host', 'https://SHO.RT/abc1234'],
    ['trailing dot', 'https://sho.rt./abc1234'],
    ['own host with port', 'http://localhost:3000/abc1234'],
    ['own host with port and trailing dot', 'http://localhost.:3000/abc1234'],
  ])('R-09 rejects a link to the service itself: %s', (_name, raw) => {
    expect(reasonOf(raw)).toBe('self_reference');
  });

  it.each([
    ['a subdomain of the own host', 'https://api.sho.rt/x'],
    ['the own host name on another port', 'http://localhost:4000/x'],
    ['a host that merely contains the own host', 'https://sho.rt.example.com/x'],
  ])('R-09 accepts %s', (_name, raw) => {
    expect(reasonOf(raw)).toBe('accepted');
  });

  it('R-09 accepts any host when the service has no own hosts configured', () => {
    expect(reasonOf('https://sho.rt/x', NO_OWN_HOSTS)).toBe('accepted');
  });
});

describe('OriginalUrl', () => {
  it('restores a stored value without validating it again', () => {
    expect(OriginalUrl.restore('ftp://legacy.example/').href).toBe('ftp://legacy.example/');
  });

  it('compares by value', () => {
    const a = OriginalUrl.parse('https://example.com', NO_OWN_HOSTS);
    const b = OriginalUrl.parse('HTTPS://EXAMPLE.COM/', NO_OWN_HOSTS);

    expect(a.equals(b)).toBe(true);
    expect(a.equals(OriginalUrl.parse('https://example.org', NO_OWN_HOSTS))).toBe(false);
    expect(String(a)).toBe('https://example.com/');
  });
});
