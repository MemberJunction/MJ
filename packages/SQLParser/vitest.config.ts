import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      environment: 'node',
      // The linear-time suites keep every worker busy with CPU-bound parsing for minutes. With the
      // default thread pool (one worker per CPU) that starves the main process, and on a 2-core CI
      // runner Vitest fails the run with "Timeout calling onTaskUpdate" after every test has passed
      // (v6.2.0-edge.7 publish gate, three runs). Forked workers, two at a time, as vitest.dom.shared.ts does.
      pool: 'forks',
      maxWorkers: 2,
      minWorkers: 1,
    },
  })
);
