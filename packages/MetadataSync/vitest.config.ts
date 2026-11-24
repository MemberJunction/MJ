import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../vitest.shared.ts';

// PullService and its tests call `process.chdir()`, which Node forbids inside worker_threads.
export default mergeConfig(sharedConfig, defineProject({ test: { environment: 'node', pool: 'forks' } }));
