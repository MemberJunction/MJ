import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

// Dual preset. agent-requests has an existing class-level spec
// (src/__tests__/agent-request-panel.test.ts) that vi.mock('@angular/core') — that mock
// breaks under the Angular compile path, so it must stay on the node preset. The new
// *.component.dom.test.ts specs (next to the components) run under the jsdom/Angular-compile
// DOM preset. The two projects are kept disjoint by EXCLUSION because mergeConfig
// concatenates include/exclude arrays — node drops *.dom.test.ts; dom drops __tests__.
// See guides/ANGULAR_TESTING_GUIDE.md §3b.
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: { name: 'agent-requests (node)', environment: 'node', exclude: ['**/*.dom.test.ts'] },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: { name: 'agent-requests (dom)', include: ['src/**/*.dom.test.ts'], exclude: ['**/__tests__/**'] },
        }),
      ),
    ],
  },
});
