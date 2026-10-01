import { Inject, Injectable } from '@nestjs/common';

import { type Database, DB_READ } from '@infra/database/database.module';

import { LinkNotFoundError } from '../domain/errors';
import { LINK_SETTINGS, type LinkSettings } from '../domain/link-settings';
import { ShortCode } from '../domain/short-code';

import { type LinkStatsDto, linkStatsSelect, toLinkStatsDto } from './dto/link-stats.dto';
import { type ShortLinkDto, shortLinkSelect, toShortLinkDto } from './dto/short-link.dto';

/** The read path: point reads by code, straight to the ORM, DTOs out. All data is public. */
@Injectable()
export class LinksQueryService {
  constructor(
    @Inject(DB_READ) private readonly db: Database,
    @Inject(LINK_SETTINGS) private readonly settings: LinkSettings,
  ) {}

  /** The representation returned right after a link is created. */
  async getShortLink(code: string): Promise<ShortLinkDto> {
    const row = await this.db.link.findUnique({
      where: { code: ShortCode.parse(code).value },
      select: shortLinkSelect,
    });
    if (!row) throw new LinkNotFoundError();
    return toShortLinkDto(row, this.settings.publicBaseUrl);
  }

  /** Visit statistics. Reading them is not a visit. */
  async getStats(code: string): Promise<LinkStatsDto> {
    const row = await this.db.link.findUnique({
      // a malformed code is "not found" before the database is asked
      where: { code: ShortCode.parse(code).value },
      select: linkStatsSelect,
    });
    if (!row) throw new LinkNotFoundError();
    return toLinkStatsDto(row);
  }
}
