import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Single DOM preset: this package's existing specs are pure type/logic tests
// (no vi.mock('@angular/core')), so they run fine under jsdom alongside the
// DOM-level spec for <mj-export-dialog>. See guides/ANGULAR_TESTING_GUIDE.md.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-export-service',
    },
  })
);
