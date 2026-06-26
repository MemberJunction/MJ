import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// DOM-level Angular component tests: jsdom + analog (Angular compile) + zoneless.
// Single preset — tab-strip has no class-level spec that vi.mock('@angular/core'),
// so its existing node specs (exports/index) run fine under jsdom too.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-tabstrip',
    },
  })
);
