import { defineConfig } from 'vitest/config';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Standalone config for the CI guard scripts in .github/scripts — this directory is
// not an npm workspace, so it can't join the per-package turbo test graph. Run with:
//   npx vitest run --config .github/scripts/vitest.config.mts
export default defineConfig({
    test: {
        root: dirname(fileURLToPath(import.meta.url)),
        include: ['__tests__/**/*.test.mjs'],
        // The fixture-based tests spawn real node child processes per package check.
        testTimeout: 30000,
    },
});
