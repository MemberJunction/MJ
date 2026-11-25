import path from 'node:path';
import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
    resolve: {
      alias: {
        '@memberjunction/ai-agents': path.resolve(__dirname, 'src/index.ts'),
      },
    },
    test: {
      environment: 'node',
      include: [
        'src/**/__tests__/**/*.test.ts',
        'src/**/*.test.ts',
        'src/**/__tests__/**/*.spec.ts',
      ],
    },
  })
);
