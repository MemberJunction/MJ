import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

// Dual preset (same arrangement as ng-conversations): the framework-free logic — auth adapter, session
// controller, stores, theme — stays on the fast node preset in `src/__tests__`, and only the specs that
// need a DOM (`*.dom.test.ts`: components and the custom-element contract) pay for jsdom + Angular AOT.
// The two projects are disjoint by EXCLUSION because mergeConfig concatenates include/exclude arrays.
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: { name: 'realtime-widget (node)', environment: 'node', exclude: ['**/*.dom.test.ts'] },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: { name: 'realtime-widget (dom)', include: ['src/**/*.dom.test.ts'], exclude: ['**/__tests__/**'] },
        }),
      ),
    ],
  },
});
