import { ApiProperty } from '@nestjs/swagger';

import type { Prisma } from '@infra/database/generated/prisma/client';

import { MAX_URL_LENGTH } from '../../domain/original-url';
import { CODE_LENGTH, CODE_PATTERN } from '../../domain/short-code';

export const shortLinkSelect = {
  code: true,
  originalUrl: true,
  createdAt: true,
} satisfies Prisma.LinkSelect;

type Row = Prisma.LinkGetPayload<{ select: typeof shortLinkSelect }>;

export class ShortLinkDto {
  @ApiProperty({
    description: 'The short code: 7 base62 characters.',
    example: 'aB3xY9z',
    pattern: CODE_PATTERN,
    minLength: CODE_LENGTH,
    maxLength: CODE_LENGTH,
  })
  code!: string;

  @ApiProperty({
    description: 'The short URL to share; visiting it redirects to `originalUrl`.',
    example: 'http://localhost:3000/aB3xY9z',
    format: 'uri',
  })
  shortUrl!: string;

  @ApiProperty({
    description: 'The destination, normalised (lower-cased host, punycode, percent-encoding).',
    example: 'https://example.com/some/very/long/path?utm_source=newsletter',
    maxLength: MAX_URL_LENGTH,
  })
  originalUrl!: string;

  @ApiProperty({ format: 'date-time', example: '2026-01-15T10:00:00.000Z' })
  createdAt!: Date;
}

export const toShortLinkDto = (row: Row, publicBaseUrl: string): ShortLinkDto => ({
  code: row.code,
  shortUrl: `${publicBaseUrl}/${row.code}`,
  originalUrl: row.originalUrl,
  createdAt: row.createdAt,
});
