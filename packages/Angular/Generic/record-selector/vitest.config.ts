import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

// Dual preset. record-selector has existing node/logic specs in src/__tests__ (filesystem
// + package.json checks) — keep them on the fast node preset, and run only the new
// *.component.dom.test.ts (next to the components) under the jsdom/Angular-compile DOM
// preset. The two projects are kept disjoint by EXCLUSION because mergeConfig concatenates
// include/exclude arrays. See guides/ANGULAR_TESTING_GUIDE.md §3b.
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: { name: 'record-selector (node)', environment: 'node', exclude: ['**/*.dom.test.ts'] },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: { name: 'record-selector (dom)', include: ['src/**/*.dom.test.ts'], exclude: ['**/__tests__/**'] },
        }),
      ),
    ],
  },
});
