import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single DOM preset. chat is a presentational, module-declared component with no external
// data loading and no vi.mock — so the existing pure-logic specs (index/exports) run fine
// under the jsdom/Angular-compile preset alongside the new *.dom.test.ts. See
// guides/ANGULAR_TESTING_GUIDE.md §3.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-chat',
    },
  })
);
