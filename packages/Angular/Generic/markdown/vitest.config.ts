import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single DOM preset: the package's existing class-level specs (index, markdown-types)
// are pure-logic and run fine under jsdom, and none of them vi.mock('@angular/core'),
// so we don't need the dual-project split. See guides/ANGULAR_TESTING_GUIDE.md §3b.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-markdown',
    },
  }),
);
