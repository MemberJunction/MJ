import { mergeConfig, defineConfig } from 'vitest/config';
import sharedConfig from '../../../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    },
  })
);
