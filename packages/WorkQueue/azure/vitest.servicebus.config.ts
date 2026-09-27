import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

const config = mergeConfig(sharedConfig, defineProject({
    test: {
        environment: 'node',
        testTimeout: 180_000,
        hookTimeout: 180_000,
        fileParallelism: false,
    },
}));

// Assigned after the merge: mergeConfig concatenates array options, and the shared include would pull the
// hermetic unit tests into the Service Bus run.
config.test.include = ['src/__servicebus__/**/*.servicebus.test.ts'];
config.test.exclude = [];

export default config;
