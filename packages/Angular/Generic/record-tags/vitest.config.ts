import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

// Dual preset. record-tags has class-level specs in src/__tests__ that vi.mock('@angular/core')
// (which breaks the Angular compile path) — keep them on the fast node preset, and run only the
// new *.component.dom.test.ts (next to the component) under the jsdom/Angular-compile DOM preset.
// The two projects are kept disjoint by EXCLUSION because mergeConfig concatenates include/exclude
// arrays — node drops *.dom.test.ts; dom drops everything under __tests__. See
// guides/ANGULAR_TESTING_GUIDE.md §3b.
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: { name: 'record-tags (node)', environment: 'node', exclude: ['**/*.dom.test.ts'] },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: { name: 'record-tags (dom)', include: ['src/**/*.dom.test.ts'], exclude: ['**/__tests__/**'] },
        }),
      ),
    ],
  },
});
