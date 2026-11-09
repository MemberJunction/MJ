import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

/**
 * Dual preset, as ng-pagination: the pure countdown/row logic is tested under the fast node preset
 * (`src/__tests__`), the rendered component under jsdom + the Angular compile path (`*.dom.test.ts`).
 * The two `exclude` rules keep the file sets disjoint.
 */
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: {
            name: '@memberjunction/ng-conversation-offers (node)',
            environment: 'node',
            exclude: ['**/*.dom.test.ts'],
          },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: {
            name: '@memberjunction/ng-conversation-offers (dom)',
            include: ['src/**/*.dom.test.ts'],
            exclude: ['**/__tests__/**'],
          },
        }),
      ),
    ],
  },
});
