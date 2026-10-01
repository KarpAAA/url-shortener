// Mutation testing on domain/ and application/ only (testing.md §4).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.stryker.config.mts' },
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate: [
    'src/modules/**/domain/**/*.ts',
    'src/modules/**/application/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/__test__/**',
  ],
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  incremental: true,
  incrementalFile: 'reports/mutation/incremental.json',
  // report-only for the first month, then domain >= 85 %, application >= 70 % (testing.md §4)
  thresholds: { high: 85, low: 70, break: null },
  tempDirName: '.stryker-tmp',
};
