import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../../vitest.shared';

/**
 * Vitest config for the **opt-in live integration suite** — the evergreen
 * end-to-end train+score test that spins up the REAL Python sidecar.
 *
 * Run with: `npm run test:integration` (from this package).
 * Requires the Sidecar venv: `cd ../Sidecar && npm run setup:python`.
 *
 * Kept separate from the default `vitest.config.ts` so the normal `npm run test`
 * (pure unit, no sidecar) stays fast and CI-safe. The suite itself is also gated
 * behind `PS_INTEGRATION=1` and skips gracefully when the venv is absent.
 */

// Loading THIS config is itself the opt-in signal — so the npm script stays
// portable (no cross-env needed). The suite still honors a pre-set
// PS_INTEGRATION=1 when run via the default config too.
process.env.PS_INTEGRATION = '1';

const merged = mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      environment: 'node',
      // Live training + sidecar startup is slower than a unit test; give hooks and
      // tests room. Per-test timeouts are also set in the suite itself.
      testTimeout: 120_000,
      hookTimeout: 60_000,
      // The sidecar is a shared, stateful process across the suite — run serially.
      fileParallelism: false,
    },
  }),
);

// Hard-OVERRIDE `include` (mergeConfig concatenates arrays, which would otherwise
// re-pull the shared unit-test glob and run the whole unit suite here too). We want
// ONLY the integration files in this run.
merged.test = merged.test ?? {};
merged.test.include = ['src/**/integration/**/*.integration.test.ts'];

export default merged;
