import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

// Dual preset. entity-card has a class-level spec in src/__tests__ that
// vi.mock('@memberjunction/core') — that mock breaks under the Angular compile path,
// so keep it on the fast node preset, and run only the new *.component.dom.test.ts
// (next to the component) under the jsdom/Angular-compile DOM preset. The two projects
// are kept disjoint by EXCLUSION because mergeConfig concatenates include/exclude arrays.
// See guides/ANGULAR_TESTING_GUIDE.md §3b.
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: { name: 'entity-card (node)', environment: 'node', exclude: ['**/*.dom.test.ts'] },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: { name: 'entity-card (dom)', include: ['src/**/*.dom.test.ts'], exclude: ['**/__tests__/**'] },
        }),
      ),
    ],
  },
});
