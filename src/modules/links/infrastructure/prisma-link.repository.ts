import { Inject, Injectable } from '@nestjs/common';

import { type Database, DB_WRITE } from '@infra/database/database.module';
import { Prisma } from '@infra/database/generated/prisma/client';

import { LinkNotFoundError, ShortCodeTakenError } from '../domain/errors';
import { OriginalUrl } from '../domain/original-url';

import { LinkMapper } from './link.mapper';

import type { ShortCode } from '../domain/short-code';
import type { ShortLink } from '../domain/short-link';
import type { LinkRepository } from '../ports/link-repository.port';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class PrismaLinkRepository implements LinkRepository {
  constructor(@Inject(DB_WRITE) private readonly db: Database) {}

  async insert(link: ShortLink): Promise<void> {
    try {
      await this.db.link.create({ data: LinkMapper.toPersistence(link), select: { id: true } });
    } catch (err) {
      // the unique index on `code` is the only arbiter of "is this code free"
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        throw new ShortCodeTakenError();
      }
      throw err;
    }
  }

  /**
   * One statement: `UPDATE links SET visits = visits + 1, … WHERE code = $1 RETURNING
   * original_url`. The increment happens inside Postgres under the row lock, so
   * concurrent visits cannot overwrite each other the way load → add → save would.
   */
  async registerVisit(code: ShortCode, at: Date): Promise<OriginalUrl> {
    const [row] = await this.db.link.updateManyAndReturn({
      where: { code: code.value },
      data: { visits: { increment: 1 }, lastVisitedAt: at },
      select: { originalUrl: true },
    });
    if (!row) throw new LinkNotFoundError();
    return OriginalUrl.restore(row.originalUrl);
  }
}
