import { defineConfig } from 'vitest/config';

import { alias, plugins, testEnv } from './vitest.shared.mts';

// unit + arch need no Docker and run in `pnpm test`; e2e starts Postgres in a container.
export default defineConfig({
  test: {
    projects: [
      {
        plugins,
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          env: testEnv,
        },
      },
      {
        plugins,
        resolve: { alias },
        test: {
          name: 'arch',
          include: ['test/architecture/**/*.spec.ts'],
          env: testEnv,
        },
      },
      {
        plugins,
        resolve: { alias },
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e-spec.ts', 'test/**/*.int-spec.ts'],
          globalSetup: ['test/setup/global.ts'],
          env: testEnv,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
