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

config.test.include = ['src/__live__/**/*.live.test.ts'];
config.test.exclude = [];

export default config;
