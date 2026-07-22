import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single DOM preset: the package has no class-level spec that mocks @angular/core,
// so the existing logic specs (index/types) run fine under jsdom alongside the
// component DOM specs. See guides/ANGULAR_TESTING_GUIDE.md §3b.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-timeline',
    },
  })
);
