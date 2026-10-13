import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// ng-charts: pure layout specs (src/lib/internal/__tests__) have no Angular
// dependency and run fine under jsdom, so a single DOM preset covers both the
// layout unit tests and the component DOM tests. See guides/ANGULAR_TESTING_GUIDE.md.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-charts',
    },
  })
);
