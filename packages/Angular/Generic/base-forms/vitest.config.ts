import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

// Dual preset. base-forms has existing class-level specs in src/__tests__ and
// src/lib/__tests__ that vi.mock('@angular/core') — that mock breaks under the
// Angular compile path, so keep them on the fast node preset, and run only the
// new *.component.dom.test.ts (next to the components) under the jsdom/Angular
// DOM preset. The two projects are kept disjoint by EXCLUSION because mergeConfig
// concatenates include/exclude arrays. See guides/ANGULAR_TESTING_GUIDE.md §3b.
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: { name: 'base-forms (node)', environment: 'node', exclude: ['**/*.dom.test.ts'] },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: { name: 'base-forms (dom)', include: ['src/**/*.dom.test.ts'], exclude: ['**/__tests__/**'] },
        }),
      ),
    ],
  },
});
