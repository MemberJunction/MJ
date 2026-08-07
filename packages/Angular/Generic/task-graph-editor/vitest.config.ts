import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single DOM preset. flow-editor's only pre-existing specs (src/__tests__/exports.test.ts,
// index.test.ts) are filesystem assertions with no vi.mock('@angular/core'), so they run fine
// under the jsdom/Angular-compile preset alongside the new *.component.dom.test.ts specs.
// See guides/ANGULAR_TESTING_GUIDE.md §3b.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-flow-editor',
    },
  })
);
