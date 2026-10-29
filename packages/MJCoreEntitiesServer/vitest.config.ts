import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      globals: true,
      environment: 'node',
      include: ['src/__tests__/**/*.test.ts'],
      coverage: { provider: 'v8', enabled: false },
    },
  })
);
