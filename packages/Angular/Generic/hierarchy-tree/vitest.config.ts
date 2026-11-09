import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.spec.ts', 'src/**/__tests__/**/*.ts'],
    },
  })
);
