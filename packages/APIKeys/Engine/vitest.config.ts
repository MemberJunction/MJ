import { mergeConfig, defineConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  sharedConfig,
  defineConfig({
    resolve: {
      alias: {
        '@memberjunction/core': resolve(__dirname, 'src/__mocks__/core.ts'),
        '@memberjunction/core-entities': resolve(__dirname, 'src/__mocks__/core-entities.ts'),
        '@memberjunction/api-keys-base': resolve(__dirname, 'src/__mocks__/api-keys-base.ts'),
      }
    },
    test: {
      environment: 'node',
      include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts', 'src/PatternMatcher.spec.ts'],
    },
  })
);
