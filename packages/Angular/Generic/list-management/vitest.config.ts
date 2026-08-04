import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

// Dual preset. list-management has existing class-level specs (src/__tests__/* and
// list-invitations/__tests__/list-invitations.component.test.ts — the latter does
// vi.mock('@angular/core'), which breaks the Angular compile path). Keep all of those
// on the fast node preset, and run only the new *.component.dom.test.ts (next to the
// components) under the jsdom/Angular-compile DOM preset. The two projects are kept
// disjoint by EXCLUSION because mergeConfig concatenates include/exclude arrays — node
// drops *.dom.test.ts; dom drops everything under any __tests__ folder. See
// guides/ANGULAR_TESTING_GUIDE.md §3b.
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: { name: 'list-management (node)', environment: 'node', exclude: ['**/*.dom.test.ts'] },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: { name: 'list-management (dom)', include: ['src/**/*.dom.test.ts'], exclude: ['**/__tests__/**'] },
        }),
      ),
    ],
  },
});
