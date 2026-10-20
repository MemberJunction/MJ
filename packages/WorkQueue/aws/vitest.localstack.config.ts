import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

const config = mergeConfig(sharedConfig, defineProject({
    test: {
        environment: 'node',
        testTimeout: 120_000,
        hookTimeout: 120_000,
        fileParallelism: false,
    },
}));

// Assigned after the merge: mergeConfig concatenates array options, and the shared include would pull the
// hermetic unit tests into the LocalStack run.
config.test.include = ['src/__localstack__/**/*.localstack.test.ts'];
config.test.exclude = [];

export default config;
