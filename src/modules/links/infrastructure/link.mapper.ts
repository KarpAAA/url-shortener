import type { Prisma } from '@infra/database/generated/prisma/client';

import type { ShortLink } from '../domain/short-link';

/**
 * Domain → persistence only. There is no `toDomain`: nothing loads a `ShortLink` back —
 * a visit is one `UPDATE … RETURNING`, and screens read through `read/`.
 */
export const LinkMapper = {
  toPersistence(link: ShortLink): Prisma.LinkUncheckedCreateInput {
    return {
      id: link.id,
      code: link.code.value,
      originalUrl: link.originalUrl.href,
      visits: link.visits,
      createdAt: link.createdAt,
      lastVisitedAt: link.lastVisitedAt,
    };
  },
};
