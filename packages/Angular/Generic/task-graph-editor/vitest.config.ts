import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// The DOM preset, even though the current specs are class-level: the package declares Angular
// components, and the shared preset is what compiles their decorators. Without it, adding the first
// *.dom.test.ts later would fail for a reason unrelated to the test being written.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-task-graph-editor',
    },
  })
);
