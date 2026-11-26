import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: {
            name: 'ng-tours (node)',
            environment: 'node',
            include: ['src/__tests__/**/*.test.ts'],
            exclude: ['**/*.dom.test.ts'],
          },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: {
            name: 'ng-tours (dom)',
            include: ['src/**/*.dom.test.ts'],
            exclude: ['**/element-bundle.test.ts'],
          },
        }),
      ),
    ],
  },
});
