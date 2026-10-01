import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { MAX_URL_LENGTH, URL_PATTERN } from '../../domain/original-url';

/**
 * Shape only: present, a string, bounded. Whether the string is an acceptable destination
 * (scheme, host, credentials, self-reference) is a domain rule — `OriginalUrl.parse`.
 */
export class ShortenUrlDto {
  @ApiProperty({
    description:
      'The URL to shorten: an absolute `http` or `https` URL with a host, without ' +
      'credentials, not pointing to this service. International (IDN/unicode) URLs are ' +
      'accepted. A string that matches the pattern can still be rejected with ' +
      '`400 INVALID_URL` when it is not a valid URL.',
    example: 'https://example.com/some/very/long/path?utm_source=newsletter',
    // no `format: uri`: internationalised URLs (IRIs) are accepted and normalised
    pattern: URL_PATTERN,
    minLength: 1,
    maxLength: MAX_URL_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_URL_LENGTH)
  url!: string;
}
