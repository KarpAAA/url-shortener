import { ApiProperty } from '@nestjs/swagger';

import type { Prisma } from '@infra/database/generated/prisma/client';

import { MAX_URL_LENGTH } from '../../domain/original-url';
import { CODE_LENGTH, CODE_PATTERN } from '../../domain/short-code';

export const linkStatsSelect = {
  code: true,
  originalUrl: true,
  visits: true,
  createdAt: true,
  lastVisitedAt: true,
} satisfies Prisma.LinkSelect;

type Row = Prisma.LinkGetPayload<{ select: typeof linkStatsSelect }>;

export class LinkStatsDto {
  @ApiProperty({
    example: 'aB3xY9z',
    pattern: CODE_PATTERN,
    minLength: CODE_LENGTH,
    maxLength: CODE_LENGTH,
  })
  code!: string;

  @ApiProperty({
    example: 'https://example.com/some/very/long/path?utm_source=newsletter',
    maxLength: MAX_URL_LENGTH,
  })
  originalUrl!: string;

  @ApiProperty({
    description: 'How many times the short link has been visited (successful redirects).',
    example: 42,
    minimum: 0,
    type: 'integer',
  })
  visits!: number;

  @ApiProperty({ format: 'date-time', example: '2026-01-15T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({
    description: 'Time of the most recent visit; `null` until the link is visited.',
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-02-01T08:30:00.000Z',
  })
  lastVisitedAt!: Date | null;
}

/** `bigint` in the database (a counter outgrows int4); a JSON number at the edge. */
const toSafeNumber = (visits: bigint): number => {
  const value = Number(visits);
  // 2^53 visits is ~285 000 years at 1000 redirects per second: clamp rather than fail
  return Number.isSafeInteger(value) ? value : Number.MAX_SAFE_INTEGER;
};

export const toLinkStatsDto = (row: Row): LinkStatsDto => ({
  code: row.code,
  originalUrl: row.originalUrl,
  visits: toSafeNumber(row.visits),
  createdAt: row.createdAt,
  lastVisitedAt: row.lastVisitedAt,
});
