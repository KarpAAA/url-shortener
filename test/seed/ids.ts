/** Fixed test data. Tests reference these constants, never values from a previous response. */
export interface SeedLink {
  readonly id: string;
  readonly code: string;
  readonly originalUrl: string;
  readonly visits: number;
  readonly createdAt: string;
  readonly lastVisitedAt: string | null;
}

/** A link nobody has visited yet. */
export const LINK_FRESH: SeedLink = {
  id: '0194a1b2-c3d4-7e5f-8a6b-000000000001',
  code: 'seedNew',
  originalUrl: 'https://example.com/fresh?utm_source=seed',
  visits: 0,
  createdAt: '2026-01-10T09:00:00.000Z',
  lastVisitedAt: null,
};

/** A link with visit history. */
export const LINK_VISITED: SeedLink = {
  id: '0194a1b2-c3d4-7e5f-8a6b-000000000002',
  code: 'seedOld',
  originalUrl: 'https://example.org/visited',
  visits: 5,
  createdAt: '2026-01-05T12:30:00.000Z',
  lastVisitedAt: '2026-01-09T18:45:00.000Z',
};

export const SEED_LINKS: readonly SeedLink[] = [LINK_FRESH, LINK_VISITED];

/** Well-formed, never issued. */
export const UNKNOWN_CODE = 'zzzzzz9';
