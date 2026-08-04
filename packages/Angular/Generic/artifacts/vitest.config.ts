import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

// Dual preset. artifacts has existing class-level specs in src/__tests__ + src/lib/__tests__
// — one of which (interactive-form-apply.service.test.ts) does vi.mock('@angular/core'),
// which breaks under the Angular compile path. Keep all node specs on the fast node preset,
// and run only the new *.component.dom.test.ts (next to the components) under the
// jsdom/Angular-compile DOM preset. The two projects are kept disjoint by EXCLUSION because
// mergeConfig concatenates include/exclude arrays. See guides/ANGULAR_TESTING_GUIDE.md §3b.
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: { name: 'artifacts (node)', environment: 'node', exclude: ['**/*.dom.test.ts'] },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: { name: 'artifacts (dom)', include: ['src/**/*.dom.test.ts'], exclude: ['**/__tests__/**'] },
        }),
      ),
    ],
  },
});
