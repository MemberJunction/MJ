import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      environment: 'node',
      include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
      // The live train+score integration suite (real Python sidecar) is opt-in via
      // a separate config (`vitest.integration.config.ts` + `npm run test:integration`)
      // so the default `npm run test` stays fast, sidecar-free, and CI-safe.
      exclude: ['**/node_modules/**', '**/dist/**', '**/generated/**', 'src/**/integration/**'],
    },
  })
);
