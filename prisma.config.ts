import { existsSync } from 'node:fs';

import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env on its own; the CLI is the only consumer of this file.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // empty when only `prisma generate` runs (install, image build): generate needs no database
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
