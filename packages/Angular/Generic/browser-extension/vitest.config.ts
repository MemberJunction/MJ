import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: { name: 'browser-extension (node)', environment: 'node', exclude: ['**/*.dom.test.ts'] },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: { name: 'browser-extension (dom)', include: ['src/**/*.dom.test.ts'], exclude: ['**/__tests__/**'] },
        }),
      ),
    ],
  },
});
