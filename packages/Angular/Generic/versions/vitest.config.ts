import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single DOM preset. ng-versions has two existing class-level specs in src/__tests__
// (index.test.ts, types.test.ts) — both are pure type/logic checks with no
// vi.mock('@angular/core'), so they run correctly under the jsdom/Angular-compile DOM
// preset alongside the new *.component.dom.test.ts specs. See
// guides/ANGULAR_TESTING_GUIDE.md §3b.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-versions',
    },
  }),
);
