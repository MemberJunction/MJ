import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// SINGLE preset: the only existing spec (record-merge-types.test.ts) is a pure
// type/interface test with no vi.mock('@angular/core'), so it runs fine under the
// jsdom DOM preset alongside the DOM component specs. See guides/ANGULAR_TESTING_GUIDE.md §3b.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-record-merge',
    },
  })
);
