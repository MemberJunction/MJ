import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single DOM preset: this package has no class-level spec that vi.mock('@angular/core'),
// so the existing node/logic specs (index.test.ts, task-models.test.ts) run fine under
// jsdom alongside the DOM component specs. See guides/ANGULAR_TESTING_GUIDE.md §3b.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-tasks',
    },
  }),
);
