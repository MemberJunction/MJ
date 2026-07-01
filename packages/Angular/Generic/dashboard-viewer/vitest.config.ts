import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single DOM preset: dashboard-viewer has no class-level spec that
// vi.mock('@angular/core'), so its existing fs/logic specs run fine under
// jsdom alongside the new *.component.dom.test.ts specs.
// See guides/ANGULAR_TESTING_GUIDE.md §3b.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-dashboard-viewer',
    },
  })
);
