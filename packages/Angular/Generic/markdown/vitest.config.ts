import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      // Web-only DOM utilities (copy buttons, collapsible toggles, svg sanitize)
      // need a document; the pure parsing logic is tested in @memberjunction/markdown-core.
      environment: 'jsdom',
    },
  })
);
