import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single DOM preset: this package has no class-level spec that
// vi.mock('@angular/core'), so its existing node/logic specs run fine under
// jsdom alongside the DOM ComponentFixture specs. See guides/ANGULAR_TESTING_GUIDE.md.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-shared-generic',
    },
  }),
);
