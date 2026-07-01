import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single DOM preset. action-gallery's existing specs (index/exports) don't vi.mock anything,
// so they run fine under the jsdom/Angular-compile preset alongside the new *.dom.test.ts.
// See guides/ANGULAR_TESTING_GUIDE.md §3.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-action-gallery',
    },
  }),
);
