import {
  All,
  Body,
  Controller,
  Get,
  HttpCode,
  type HttpRedirectResponse,
  HttpStatus,
  Param,
  Post,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { MethodNotAllowedProblem } from '@common/http/method-not-allowed.exception';
import { CreatedLocation } from '@common/interceptors/location.interceptor';

import { ResolveLinkService } from '../application/resolve-link.service';
import { ShortenUrlService } from '../application/shorten-url.service';
import { LinkStatsDto } from '../read/dto/link-stats.dto';
import { ShortLinkDto } from '../read/dto/short-link.dto';
import { LinksQueryService } from '../read/links.query.service';

import { ShortenUrlDto } from './dto/shorten-url.dto';
import { ApiGetStats, ApiRedirect, ApiShortenUrl } from './links.swagger';

const READ_METHODS = ['GET', 'HEAD'];

/**
 * `code` is deliberately a bare `@Param` with no pipe: a malformed code must answer 404
 * like an unknown one, not 400, and that rule lives in the domain (`ShortCode.parse`).
 *
 * Routes are matched in declaration order. Each path is followed by an `@All` fallback, so
 * a known path with the wrong method answers 405 with `Allow` instead of a misleading 404 —
 * and `/shorten` is claimed before the root catch-all `/:code` can see it.
 */
@ApiTags('links')
@Controller()
export class LinksController {
  constructor(
    private readonly shorten: ShortenUrlService,
    private readonly resolve: ResolveLinkService,
    private readonly query: LinksQueryService,
  ) {}

  @Post('shorten')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottlerGuard)
  @CreatedLocation((link: ShortLinkDto) => `/stats/${link.code}`)
  @ApiShortenUrl()
  // 201 with the resource instead of the default `{ id }`: the client needs `shortUrl` at once
  async shortenUrl(@Body() dto: ShortenUrlDto): Promise<ShortLinkDto> {
    const { code } = await this.shorten.execute({ url: dto.url });
    return this.query.getShortLink(code);
  }

  @All('shorten')
  @ApiExcludeEndpoint()
  shortenOtherMethods(): never {
    throw new MethodNotAllowedProblem(['POST']);
  }

  @Get('stats/:code')
  @ApiGetStats()
  getStats(@Param('code') code: string): Promise<LinkStatsDto> {
    return this.query.getStats(code);
  }

  @All('stats/:code')
  @ApiExcludeEndpoint()
  statsOtherMethods(): never {
    throw new MethodNotAllowedProblem(READ_METHODS);
  }

  @Get(':code')
  @Redirect()
  @ApiRedirect()
  async redirect(@Param('code') code: string): Promise<HttpRedirectResponse> {
    const { url } = await this.resolve.execute({ code });
    return { url, statusCode: HttpStatus.FOUND };
  }

  @All(':code')
  @ApiExcludeEndpoint()
  redirectOtherMethods(): never {
    throw new MethodNotAllowedProblem(READ_METHODS);
  }
}
