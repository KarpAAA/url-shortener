import { InvalidUrlError } from './errors';

export const MAX_URL_LENGTH = 2048;

const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);
/**
 * How a destination must start: `http://` or `https://` followed by a host character.
 * The WHATWG parser alone is too lenient — `http:example.com`, `http:\\example.com`,
 * `http:///path` (host `path`) and `  http://x` all parse — so the raw string is checked
 * too. Written without regex flags because the same pattern is published in the OpenAPI
 * schema, and there every string that does not match must really be rejected.
 */
export const URL_PATTERN = '^[Hh][Tt][Tt][Pp][Ss]?://[^/\\\\?#]';

const HAS_AUTHORITY = new RegExp(URL_PATTERN);

/** What the validation needs to know about the deployment. */
export interface UrlRules {
  /** Hosts (with a non-default port) of this service; a link to them would loop. */
  readonly ownHosts: readonly string[];
}

const withoutTrailingDot = (host: string): string => host.replace(/\.(?=:\d+$|$)/, '');

/**
 * The destination of a short link: an absolute http(s) URL, normalised by the WHATWG URL
 * parser so that what is stored is exactly what the `Location` header carries.
 */
export class OriginalUrl {
  private constructor(readonly href: string) {}

  static parse(raw: unknown, rules: UrlRules): OriginalUrl {
    if (typeof raw !== 'string') throw new InvalidUrlError('not_a_string');
    if (raw.trim() === '') throw new InvalidUrlError('empty');
    if (raw.length > MAX_URL_LENGTH) throw new InvalidUrlError('too_long');

    const url = OriginalUrl.toUrl(raw);
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) throw new InvalidUrlError('unsupported_scheme');
    if (!HAS_AUTHORITY.test(raw)) throw new InvalidUrlError('malformed');
    if (url.username !== '' || url.password !== '') throw new InvalidUrlError('credentials');
    if (rules.ownHosts.some((own) => withoutTrailingDot(url.host) === own.toLowerCase())) {
      throw new InvalidUrlError('self_reference');
    }
    // percent-encoding and punycode can grow the string past the limit the column enforces
    if (url.href.length > MAX_URL_LENGTH) throw new InvalidUrlError('too_long');

    return new OriginalUrl(url.href);
  }

  /** Rehydration from persistence: stored data is trusted. */
  static restore(href: string): OriginalUrl {
    return new OriginalUrl(href);
  }

  private static toUrl(raw: string): URL {
    try {
      return new URL(raw);
    } catch {
      throw new InvalidUrlError('malformed');
    }
  }

  equals(other: OriginalUrl): boolean {
    return this.href === other.href;
  }

  toString(): string {
    return this.href;
  }
}
