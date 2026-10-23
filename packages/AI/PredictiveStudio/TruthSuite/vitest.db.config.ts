import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../../vitest.shared';
const merged = mergeConfig(sharedConfig, defineProject({
  // One database for every file: files run one at a time, so no file sees another's loads mid-test.
  test: { environment: 'node', testTimeout: 300_000, fileParallelism: false },
}));
merged.test = merged.test || {};
merged.test.include = ['src/**/__tests__/**/*.integration.test.ts', 'src/**/__tests__/**/*.db.test.ts'];
export default merged;
