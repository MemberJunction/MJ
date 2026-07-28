import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// The engine (src/lib/engine) is Angular-free but still DOM-bound — every algorithm
// operates on real Node/Range/Selection objects — so the whole package runs on the
// jsdom preset rather than the node one. See guides/ANGULAR_TESTING_GUIDE.md.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-rich-text-editor',
    },
  }),
);
