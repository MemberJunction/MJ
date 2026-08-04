import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single DOM preset. forms has only pure-logic class-level specs under src/__tests__
// (none mock '@angular/core'), so they run fine under the jsdom/Angular-compile path
// alongside the new *.component.dom.test.ts specs. See guides/ANGULAR_TESTING_GUIDE.md §3b.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-forms',
    },
  })
);
