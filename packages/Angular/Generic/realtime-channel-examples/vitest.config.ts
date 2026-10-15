import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

// Dual preset (see guides/ANGULAR_TESTING_GUIDE.md §3b): class-level specs in src/__tests__ run on the fast node
// preset; *.dom.test.ts specs (next to the code) render real Angular templates under the jsdom preset. The two
// projects are kept disjoint by exclusion because mergeConfig concatenates include/exclude arrays.
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: { name: 'realtime-channel-examples (node)', environment: 'node', exclude: ['**/*.dom.test.ts'] },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: { name: 'realtime-channel-examples (dom)', include: ['src/**/*.dom.test.ts'], exclude: ['**/__tests__/**'] },
        }),
      ),
    ],
  },
});
