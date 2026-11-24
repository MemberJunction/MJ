import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    // Keep Vitest's default `forks` pool here: some packages load Linux-unsafe native addons in
    // worker_threads or assign `process.env.TZ` / `process.chdir()` in tests. Pure-JS heavy
    // packages opt into `pool: 'threads'` in their own vitest.config.ts (verified by
    // `.github/scripts/check-vitest-threads-safety.mjs`).
    testTimeout: 30000,
    // Match the test timeout: hooks default to 10s, but setup hooks that cold-import a
    // heavy transitive module graph (e.g. `await import(...)` in beforeEach) can exceed
    // that on a loaded CI runner and flake with "Hook timed out in 10000ms". 30s gives
    // the same headroom tests already have without masking a genuine hang.
    hookTimeout: 30000,
    restoreMocks: true,
    passWithNoTests: true,
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/generated/**'],
  },
});
