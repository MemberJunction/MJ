import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single DOM preset: the only existing specs are filesystem-shape checks that run
// fine under jsdom, and no class-level spec uses vi.mock('@angular/core'), so we
// don't need the dual node/dom split. See guides/ANGULAR_TESTING_GUIDE.md §3b.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-join-grid',
    },
  }),
);
