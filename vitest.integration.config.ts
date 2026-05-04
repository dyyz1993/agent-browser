import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: [
      'src/__tests__/cli.daemon.test.ts',
      'src/__tests__/browser.getFrame.test.ts',
      'src/__tests__/e2e/**/*.test.ts',
      'test/**/*.test.ts',
    ],
    testTimeout: 60000,
    pool: 'forks',
  },
});
