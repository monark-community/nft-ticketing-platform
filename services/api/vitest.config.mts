import { defineConfig } from 'vitest/config';
import { TEST_ENV } from './test/testEnv';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    env: TEST_ENV,
    globalSetup: ['./test/globalSetup.ts'],
    setupFiles: ['./test/setup.ts'],
    // Every test file shares one database, so run files one at a time
    fileParallelism: false,
  },
});
