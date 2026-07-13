import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// Phase 2 DOM-testing rollout for ng-entity-viewer. Single preset: no existing
// class-level spec mocks '@angular/core', so the pure-logic specs run fine under
// jsdom alongside the new *.dom.test.ts component specs.
// See guides/ANGULAR_TESTING_GUIDE.md.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-entity-viewer',
    },
  })
);
