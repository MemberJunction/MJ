import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      environment: 'node',
      // Type-level tests (`*.test-d.ts`). Ordinary vitest transpiles without checking
      // types, so drift between the replay script's two declarations — the engine's
      // `ComputerUseTrace` and the JSONType CodeGen emits into `core-entities` — would
      // compile, pass every runtime test, and surface later as a field TypeScript
      // insists does not exist. These files are checked by tsc, so it fails here.
      typecheck: {
        enabled: true,
        include: ['src/__tests__/**/*.test-d.ts'],
        // The package tsconfig already includes all of `src/**`, so it puts the
        // assertions in the program rather than producing an empty one. Verified by
        // renaming a field on the generated side and confirming these then fail.
        tsconfig: './tsconfig.json',
      },
    },
  })
);
