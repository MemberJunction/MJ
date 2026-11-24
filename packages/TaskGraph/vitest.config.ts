import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      globals: false,
      environment: 'node',
      pool: 'threads',
      include: ['src/__tests__/**/*.test.ts'],
    },
  })
);
