import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      environment: 'node',
      // `*.test-d.ts` files are typechecked by tsc; ordinary vitest only transpiles,
      // so type drift between the replay script's two declarations would otherwise
      // compile and pass. The package tsconfig covers all of `src`, so pointing at it
      // puts the assertions in the program rather than producing an empty one.
      typecheck: {
        enabled: true,
        include: ['src/__tests__/**/*.test-d.ts'],
        tsconfig: './tsconfig.json',
      },
    },
  })
);
