import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single DOM preset: the existing class-level specs (tree-events, tree-types,
// index) are pure-logic tests with no vi.mock('@angular/core'), so they run
// fine under the jsdom/Angular compile path alongside the new *.dom.test.ts
// component specs. See guides/ANGULAR_TESTING_GUIDE.md §3b.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-trees',
    },
  })
);
