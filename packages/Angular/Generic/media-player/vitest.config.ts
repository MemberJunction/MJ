import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

// DOM-level Angular component tests: jsdom + analog (Angular compile) + zoneless.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '@memberjunction/ng-media-player',
    },
  })
);
