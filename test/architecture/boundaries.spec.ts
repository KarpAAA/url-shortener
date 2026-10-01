// Reproduced from nest-conventions templates/test/architecture/boundaries.spec.ts.
// Architecture rules of eslint.config.mjs, proven to fire. A green `pnpm lint` means either
// "no violations" or "the rule silently stopped working" (a plugin upgrade, a typo in an
// element pattern); these cases tell the two apart. Each bad snippet is linted as if it lived
// at `filePath`; that file does not exist, but everything it imports does — an unresolved
// import has no element type, and the case would pass for the wrong reason.
import { resolve } from 'node:path';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

const ARCH_RULES = new Set(['no-restricted-imports', 'no-restricted-syntax']);

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({
    cwd: ROOT,
    // virtual files are outside the tsconfig program; the architecture rules need no types
    overrideConfig: tseslint.configs.disableTypeChecked,
    ruleFilter: ({ ruleId }) => ruleId.startsWith('boundaries/') || ARCH_RULES.has(ruleId),
  });
});

const ruleIdsOf = (results: ESLint.LintResult[]): (string | null)[] =>
  results.flatMap((result) => result.messages.map((message) => message.ruleId));

describe('R-47 violations fail lint', () => {
  it.each([
    {
      name: 'infrastructure (the database) in domain',
      filePath: 'src/modules/links/domain/arch-probe.ts',
      code: `import { DB_WRITE } from '@infra/database/database.module';`,
      ruleId: 'boundaries/element-types',
    },
    {
      name: 'Nest in domain',
      filePath: 'src/modules/links/domain/arch-probe.ts',
      code: `import { Injectable } from '@nestjs/common';`,
      ruleId: 'boundaries/external',
    },
    {
      name: 'any package in domain (allow-list)',
      filePath: 'src/modules/links/domain/arch-probe.ts',
      code: `import { z } from 'zod';`,
      ruleId: 'boundaries/external',
    },
    {
      name: 'application in domain',
      filePath: 'src/modules/links/domain/arch-probe.ts',
      code: `import { ShortenUrlService } from '../application/shorten-url.service';`,
      ruleId: 'boundaries/element-types',
    },
    {
      name: 'configuration in domain',
      filePath: 'src/modules/links/domain/arch-probe.ts',
      code: `import { appConfig } from '@config/app.config';`,
      ruleId: 'boundaries/element-types',
    },
    {
      name: 'Nest in ports',
      filePath: 'src/modules/links/ports/arch-probe.port.ts',
      code: `import { Injectable } from '@nestjs/common';`,
      ruleId: 'boundaries/external',
    },
    {
      name: 'Prisma in application',
      filePath: 'src/modules/links/application/arch-probe.ts',
      code: `import { PrismaPg } from '@prisma/adapter-pg';`,
      ruleId: 'boundaries/external',
    },
    {
      name: 'the Prisma service in application',
      filePath: 'src/modules/links/application/arch-probe.ts',
      code: `import { PrismaService } from '@infra/database/prisma.service';`,
      ruleId: 'boundaries/element-types',
    },
    {
      name: 'the module infrastructure (repository) in application',
      filePath: 'src/modules/links/application/arch-probe.ts',
      code: `import { PrismaLinkRepository } from '../infrastructure/prisma-link.repository';`,
      ruleId: 'boundaries/element-types',
    },
    {
      name: 'configuration in application',
      filePath: 'src/modules/links/application/arch-probe.ts',
      code: `import { appConfig } from '@config/app.config';`,
      ruleId: 'boundaries/element-types',
    },
    {
      name: 'the controller in application',
      filePath: 'src/modules/links/application/arch-probe.ts',
      code: `import { LinksController } from '../interface/links.controller';`,
      ruleId: 'boundaries/element-types',
    },
    {
      name: 'another module internals by alias',
      filePath: 'src/modules/billing/application/arch-probe.ts',
      code: `import { LinksModule } from '@modules/links/links.module';`,
      ruleId: 'no-restricted-imports',
    },
    {
      name: 'another module internals by relative path',
      filePath: 'src/modules/billing/application/arch-probe.ts',
      code: `import { ShortenUrlService } from '../../links/application/shorten-url.service';`,
      ruleId: 'boundaries/element-types',
    },
    {
      name: 'another module domain by relative path',
      filePath: 'src/modules/billing/domain/arch-probe.ts',
      code: `import { ShortCode } from '../../links/domain/short-code';`,
      ruleId: 'boundaries/element-types',
    },
    {
      name: 'controller in the core module',
      filePath: 'src/modules/links/links.module.ts',
      code: `import { LinksController } from './interface/links.controller';`,
      ruleId: 'boundaries/element-types',
    },
    {
      name: '@Controller outside a *.controller.ts',
      filePath: 'src/modules/links/application/arch-probe.ts',
      code: `@Controller('probe') export class ArchProbe {}`,
      ruleId: 'no-restricted-syntax',
    },
    {
      name: '@Processor outside a *.consumer.ts',
      filePath: 'src/modules/links/application/arch-probe.ts',
      code: `@Processor('links') export class ArchProbe {}`,
      ruleId: 'no-restricted-syntax',
    },
    {
      name: 'a business module in the shared frame',
      filePath: 'src/common/arch-probe.ts',
      code: `import { ShortCode } from '../modules/links/domain/short-code';`,
      ruleId: 'boundaries/element-types',
    },
    {
      name: 'infrastructure in common',
      filePath: 'src/common/arch-probe.ts',
      code: `import { DB_WRITE } from '@infra/database/database.module';`,
      ruleId: 'boundaries/element-types',
    },
    {
      name: 'the Nest pipeline (common) in shared',
      filePath: 'src/shared/arch-probe.ts',
      code: `import { UseCase } from '@common/decorators/use-case.decorator';`,
      ruleId: 'boundaries/element-types',
    },
  ])('$name → $ruleId', async ({ filePath, code, ruleId }) => {
    const results = await eslint.lintText(code, { filePath });

    expect(ruleIdsOf(results)).toContain(ruleId);
  });
});

// guards against a rule that forbids everything: the real wiring passes
describe('R-47 the real wiring passes', () => {
  it.each([
    'src/entrypoints/api.module.ts',
    'src/entrypoints/bootstrap.ts',
    'src/infrastructure/shared.module.ts',
    'src/infrastructure/health/health.http.module.ts',
    'src/modules/links/domain/short-link.ts',
    'src/modules/links/domain/original-url.ts',
    'src/modules/links/ports/link-repository.port.ts',
    'src/modules/links/application/shorten-url.service.ts',
    'src/modules/links/application/resolve-link.service.ts',
    'src/modules/links/infrastructure/prisma-link.repository.ts',
    'src/modules/links/read/links.query.service.ts',
    'src/modules/links/interface/links.controller.ts',
    'src/modules/links/links.module.ts',
    'src/modules/links/links.http.module.ts',
  ])('%s', async (filePath) => {
    const results = await eslint.lintFiles([filePath]);

    expect(results).toHaveLength(1);
    expect(ruleIdsOf(results)).toEqual([]);
  });
});
