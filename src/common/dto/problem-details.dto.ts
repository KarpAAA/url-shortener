import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProblemFieldErrorDto {
  @ApiProperty({ description: 'Path of the offending field, dot-notation.', example: 'url' })
  path!: string;

  @ApiProperty({ description: 'Name of the violated constraint.', example: 'isString' })
  code!: string;

  @ApiProperty({ example: 'url must be a string' })
  message!: string;
}

/** RFC 9457 problem details, plus the extension members every error of this API carries. */
export class ProblemDetailsDto {
  @ApiProperty({
    description:
      'RFC 9457 problem type. Always `about:blank`: the problem has no semantics beyond the ' +
      'HTTP status code, and `code` is the machine-readable discriminator.',
    example: 'about:blank',
  })
  type!: string;

  @ApiProperty({ description: 'HTTP status phrase.', example: 'Bad Request' })
  title!: string;

  @ApiProperty({ description: 'HTTP status code.', example: 400 })
  status!: number;

  @ApiProperty({
    description: 'Human-readable explanation. May change; do not branch on it.',
    example: 'URL scheme must be http or https',
  })
  detail!: string;

  @ApiProperty({ description: 'Path of the request that failed.', example: '/shorten' })
  instance!: string;

  @ApiProperty({
    description: 'Stable, machine-readable error code. Branch on this.',
    example: 'INVALID_URL',
  })
  code!: string;

  @ApiProperty({
    description: 'Id of the request, also returned in the `x-correlation-id` header.',
    example: '0194a1b2-c3d4-7e5f-8a6b-0123456789ab',
  })
  correlationId!: string;

  @ApiPropertyOptional({
    description: 'Per-field errors. Present only when `code` is `VALIDATION_FAILED`.',
    type: [ProblemFieldErrorDto],
  })
  errors?: ProblemFieldErrorDto[];
}
