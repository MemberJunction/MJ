import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      globals: false,
      environment: 'node',
      include: ['src/__tests__/**/*.test.ts'],
    },
  })
);
