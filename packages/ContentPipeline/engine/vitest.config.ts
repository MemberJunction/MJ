import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

export default mergeConfig(sharedConfig, defineProject({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
}));
