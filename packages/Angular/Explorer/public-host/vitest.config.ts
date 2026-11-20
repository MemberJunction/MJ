import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';

export default mergeConfig(
  nodeSharedConfig,
  defineConfig({
    test: { name: 'ng-public-host', environment: 'node' },
  }),
);
