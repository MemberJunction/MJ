import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      globals: true,
      include: ['src/__tests__/**/*.test.ts'],
      // The shared preset sets `restoreMocks: true`; this package's specs are written against
      // mocks that persist across cases, so inheriting it fails 6 tests in
      // install-orchestrator-order.test.ts ("expected spy to be called at least once", and
      // undefined where a mock's return value is expected). Opting out keeps the previous
      // behaviour — the point of extending the preset here is its 30s test/hook timeouts, not
      // its mock policy. Making those specs set their mocks up per-case is a separate change.
      restoreMocks: false,
    },
  })
);
