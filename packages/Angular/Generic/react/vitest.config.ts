import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single DOM preset: this package has no class-level spec that mocks
// '@angular/core', so the existing node specs run fine under jsdom alongside
// the new *.component.dom.test.ts specs. See guides/ANGULAR_TESTING_GUIDE.md.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-react',
    },
  }),
);
