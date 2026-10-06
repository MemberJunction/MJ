import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      environment: 'node',
      // The two repo-wide compliance scanners that live in this folder are NOT unit tests of
      // MJGlobal — they read `packages/**` off disk (`SCAN_ROOT = .../packages`) and assert about
      // every package in the monorepo. Run as part of this package's `test` task they were
      // effectively disabled: turbo caches `test` on `inputs: src/**` of THIS package, so a
      // violation introduced anywhere else left the cached pass valid and the scan replayed
      // ("cache hit, replaying logs") instead of running. They then fired only when MJGlobal's own
      // source happened to change, dropping an unrelated author into someone else's debt — which
      // is how #4317's violations sat on `next` from 2026-09-09 until #4343 touched this package.
      //
      // They now run in the `Source guards` CI job: uncached, on every PR, next to the other gates
      // that read source text rather than build output. Excluded here so the cached per-package
      // task tests only what its cache key actually covers.
      exclude: [
        ...(sharedConfig.test?.exclude ?? []),
        'src/__tests__/UUIDCompliance.test.ts',
        'src/__tests__/MultiProviderCompliance.test.ts',
      ],
    },
  })
);
