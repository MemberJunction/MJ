import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

// Dual preset. code-editor has existing class-level/logic specs in src/__tests__
// (toolbar-config, index) that run on the fast node preset, and a new
// *.component.dom.test.ts (next to the component) under the jsdom/Angular-compile
// DOM preset. The two projects are kept disjoint by EXCLUSION because mergeConfig
// concatenates include/exclude arrays — node drops *.dom.test.ts; dom drops
// everything under __tests__. See guides/ANGULAR_TESTING_GUIDE.md §3b.
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: { name: 'code-editor (node)', environment: 'node', exclude: ['**/*.dom.test.ts'] },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: { name: 'code-editor (dom)', include: ['src/**/*.dom.test.ts'], exclude: ['**/__tests__/**'] },
        }),
      ),
    ],
  },
});
