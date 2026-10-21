import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../../vitest.shared';
const merged = mergeConfig(sharedConfig, defineProject({
  test: {
    environment: 'node',
    testTimeout: 600_000,
  },
}));
merged.test = merged.test || {};
merged.test.include = ['generators/__tests__/**/*.test.ts'];
export default merged;
