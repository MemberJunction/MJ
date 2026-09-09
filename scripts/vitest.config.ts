import { defineConfig } from 'vitest/config';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    root: dirname(fileURLToPath(import.meta.url)),
    include: ['__tests__/**/*.test.ts'],
    testTimeout: 30000,
  },
});
