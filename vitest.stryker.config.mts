import { defineConfig } from 'vitest/config';

import { alias, plugins, testEnv } from './vitest.shared.mts';

// Mutation testing runs the unit suite of the mutated layers only (testing.md §4).
export default defineConfig({
  plugins,
  resolve: { alias },
  test: {
    include: ['src/modules/**/domain/**/*.spec.ts', 'src/modules/**/application/**/*.spec.ts'],
    env: testEnv,
  },
});
