import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
      test: {
          globals: true,
          environment: 'node',
          setupFiles: ['src/__tests__/setup.ts'],
          include: ['src/__tests__/**/*.test.ts'],
      },
  })
);
