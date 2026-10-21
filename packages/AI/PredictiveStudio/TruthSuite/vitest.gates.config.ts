// vitest.gates.config.ts — gate runs: serial, one process (gates share loaded datasets and trained models).
import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../../vitest.shared';
const merged = mergeConfig(sharedConfig, defineProject({
  test: {
    environment: 'node',
    testTimeout: 60 * 60_000,
    hookTimeout: 10 * 60_000,
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    sequence: { concurrent: false },
  },
}));
merged.test = merged.test || {};
merged.test.include = ['gates/**/*.gates.test.ts'];
export default merged;
