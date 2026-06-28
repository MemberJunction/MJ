import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// ng-ui-components is the Phase 0 / Phase 1 DOM-testing pilot package: its leaf
// components (switch, progress-bar, stat-badge, …) are pure, gating-heavy, and
// render with no external data, so they are the cheapest possible proof that
// the TestBed + jsdom harness works. See guides/ANGULAR_TESTING_GUIDE.md.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-ui-components',
    },
  })
);
