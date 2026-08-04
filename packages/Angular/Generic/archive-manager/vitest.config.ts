import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// DOM-level Angular component tests: jsdom + analog (Angular compile) + zoneless
// TestBed. See guides/ANGULAR_TESTING_GUIDE.md.
//
// If this package ALSO has class-level specs that `vi.mock('@angular/core')`,
// don't use this single-preset config — split into node + dom vitest projects
// instead (see packages/Angular/Generic/pagination/vitest.config.ts).
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-archive-manager',
    },
  }),
);
