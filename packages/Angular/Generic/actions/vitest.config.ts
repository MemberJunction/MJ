import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// DOM preset (single): @memberjunction/ng-actions has no class-level spec that
// vi.mock('@angular/core'), so its existing node/logic specs run fine under jsdom
// alongside the new DOM specs. The high-value DOM targets are the pure
// @Input/@Output dialog components (param, result-code, test-harness wrapper).
// See guides/ANGULAR_TESTING_GUIDE.md.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-actions',
    },
  })
);
