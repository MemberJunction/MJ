import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    // Keep Vitest's default `forks` pool. Do NOT set `pool: 'threads'` here: on the Linux CI
    // runners worker_threads segfaulted pure-JS packages too (ai-agents, task-graph, codegen-lib),
    // and threads break tests that set `process.env.TZ`, call `process.chdir()` or time work with
    // `process.cpuUsage()`. A single package may opt in only with a green full Linux CI run
    // (`turbo run test --continue`) recorded in `.github/scripts/vitest-threads-allowlist.json`;
    // `.github/scripts/check-vitest-threads-safety.mjs` enforces both.
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
