import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single DOM preset: the existing __tests__ specs are filesystem/package-json
// assertions (no vi.mock('@angular/core')) and run fine under jsdom alongside the
// new *.component.dom.test.ts component specs. See guides/ANGULAR_TESTING_GUIDE.md.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-file-storage',
    },
  })
);
