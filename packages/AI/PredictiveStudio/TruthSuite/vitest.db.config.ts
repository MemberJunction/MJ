import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../../vitest.shared';
const merged = mergeConfig(sharedConfig, defineProject({
  test: { environment: 'node', testTimeout: 300_000 },
}));
merged.test = merged.test || {};
merged.test.include = ['src/**/__tests__/**/*.integration.test.ts'];
export default merged;
