import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';
import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Shared Vitest preset for **DOM-level Angular component tests**.
 *
 * Peer to `vitest.shared.ts` (the node preset). A package opts into DOM testing
 * by having its `vitest.config.ts` extend THIS file instead of `vitest.shared`:
 *
 * ```ts
 * import { defineProject, mergeConfig } from 'vitest/config';
 * import domShared from '<relpath>/vitest.dom.shared';
 * export default mergeConfig(domShared, defineProject({ test: {} }));
 * ```
 *
 * What it adds on top of the node preset:
 *  - `@analogjs/vite-plugin-angular` — compiles Angular templates/decorators so
 *    components render under Vitest (AOT; `jit: false`).
 *  - `environment: 'jsdom'` — a real (headless) DOM to render into.
 *  - the shared zoneless setup file (`vitest.dom.setup.ts`).
 *
 * Node-only packages stay on `vitest.shared.ts`; only DOM specs pay the jsdom +
 * Angular-compile cost. See `guides/ANGULAR_TESTING_GUIDE.md`.
 */
const domSetupFile = fileURLToPath(new URL('./vitest.dom.setup.ts', import.meta.url));

// The Angular compiler must see the spec files in its TypeScript program to
// type-check templates. Each package's build `tsconfig.json` deliberately
// EXCLUDES `*.test.ts`, so a DOM-testing package adds a `tsconfig.spec.json`
// (extends the build config, re-includes specs). We auto-detect it relative to
// the package's working directory; if absent, analog falls back to discovery.
const specTsconfig = resolve(process.cwd(), 'tsconfig.spec.json');
const angularOptions = existsSync(specTsconfig) ? { jit: false, tsconfig: specTsconfig } : { jit: false };

export default defineConfig({
  plugins: [
    // AOT-compile Angular sources for the test bundle. `jit: false` keeps us on
    // the same compilation path the libraries ship with.
    angular(angularOptions),
    tsconfigPaths(),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [domSetupFile],
    testTimeout: 30000,
    // Match the test timeout so setup hooks that cold-import a heavy module graph don't
    // flake against the stingy 10s hook default (see vitest.shared.ts for the rationale).
    hookTimeout: 30000,
    restoreMocks: true,
    passWithNoTests: true,
    // Angular's compiled output references `globalThis` symbols, so we run in a
    // forked process (not threads). CRITICAL: do NOT run spec files in parallel.
    // Each DOM spec file carries a full Angular AOT compile + jsdom; with
    // parallelism ON, one package spawns up to CPU-count heavy workers, and with
    // several DOM packages running concurrently under turbo the peak memory OOMs
    // CI's 16 GB runner (SIGKILL / exit 137). `fileParallelism: false` bounds a
    // package to ONE worker at a time (the Vitest-4 replacement for the removed
    // `poolOptions.forks.singleFork`). Pair with a turbo test `--concurrency`
    // cap in CI to bound how many packages run at once.
    pool: 'forks',
    fileParallelism: false,
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/generated/**'],
    coverage: {
      provider: 'v8',
      // List EVERY source file, not just the ones a test imported — so untested
      // components surface as 0% instead of silently vanishing from the report.
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/**/public-api.ts', 'src/**/*.module.ts'],
      reporter: ['text', 'html'],
    },
  },
});
