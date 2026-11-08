import { defineConfig, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

export default mergeConfig(
    sharedConfig,
    defineConfig({
        test: {
            environment: 'jsdom',
            include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
        },
    })
);
