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
            name: '@memberjunction/ng-communications (node)',
            environment: 'jsdom',
            globals: true,
            include: ['src/**/*.test.ts'],
            exclude: ['**/*.dom.test.ts'],
          },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: {
            name: '@memberjunction/ng-communications (dom)',
            include: ['src/**/*.dom.test.ts'],
            exclude: ['src/lib/comms-preference-center.component.test.ts'],
          },
        }),
      ),
    ],
  },
});
