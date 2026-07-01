import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single preset. query-viewer's two existing class-level specs (src/__tests__/*.test.ts)
// are plain filesystem/sanity checks that run fine under jsdom — none of them
// vi.mock('@angular/core'), so there is no need for the dual node/dom split. The DOM
// specs live next to their components as *.component.dom.test.ts. See
// guides/ANGULAR_TESTING_GUIDE.md §3b.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-query-viewer',
    },
  }),
);
