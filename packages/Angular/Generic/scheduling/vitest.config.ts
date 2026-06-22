import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

// Dual preset. scheduling has existing class-level specs in src/__tests__ — one of which
// uses vi.mock('@angular/core'), which breaks under the Angular compile path. Keep those on
// the fast node preset, and run only the new *.component.dom.test.ts (next to the components)
// under the jsdom/Angular-compile DOM preset. The two projects are kept disjoint by
// EXCLUSION because mergeConfig concatenates include/exclude arrays. See
// guides/ANGULAR_TESTING_GUIDE.md §3b.
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: { name: 'scheduling (node)', environment: 'node', exclude: ['**/*.dom.test.ts'] },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: { name: 'scheduling (dom)', include: ['src/**/*.dom.test.ts'], exclude: ['**/__tests__/**'] },
        }),
      ),
    ],
  },
});
