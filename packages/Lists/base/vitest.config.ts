import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

// Pure types/interfaces package — no runtime, no tests. The shared config's
// passWithNoTests: true lets `npm run test` succeed without test files. We
// still ship a local config so vitest doesn't walk up to the root config
// (which has a `projects` array that doesn't include packages/Lists).
export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      environment: 'node',
    },
  })
);
