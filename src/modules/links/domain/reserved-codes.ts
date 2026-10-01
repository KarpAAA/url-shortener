/**
 * Root path segments the service serves itself. `GET /:code` shares the root with them, so
 * a code spelled like one would be unreachable or would shadow the route.
 *
 * Only words of exactly `CODE_LENGTH` characters can collide today (`shorten`, and `metrics`
 * for the endpoint described in docs/scaling.md); the shorter ones are listed so the rule
 * survives a change of the code length. A new root route goes here.
 */
const RESERVED_WORDS: ReadonlySet<string> = new Set([
  'shorten',
  'stats',
  'health',
  'docs',
  'metrics',
]);

/** Case-insensitive: Express matches routes case-insensitively. */
export const isReservedWord = (candidate: string): boolean =>
  RESERVED_WORDS.has(candidate.toLowerCase());
