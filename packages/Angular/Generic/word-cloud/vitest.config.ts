import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// word-cloud (Phase 2 DOM-testing rollout). The single standalone leaf component
// (<mj-word-cloud>) is pure @Input/@Output and renders SVG <text> nodes, so it
// DOM-tests cleanly. The existing pure-function layout spec
// (src/__tests__/word-cloud-layout.test.ts) has no vi.mock('@angular/core') and
// runs fine under jsdom too, so a SINGLE preset suffices (no node/dom split).
// See guides/ANGULAR_TESTING_GUIDE.md.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-word-cloud',
    },
  })
);
