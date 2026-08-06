import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

// Dual-preset layout (see ng-pagination's config for the worked example):
//   - **node** — the specs in `src/__tests__` (exports smoke + public-entry smoke). The
//     entry smoke imports the FULL public API; under the DOM preset that trips analog's
//     AOT program (tsconfig.spec.json deliberately includes only the two piloted
//     components, so everything else stays an unresolved JIT component and TestBed's
//     scoping flush throws). Under the node preset the import is metadata-only and fine.
//   - **dom**  — the `*.component.dom.test.ts` fixture specs (jsdom + analog + zoneless
//     TestBed), scoped by tsconfig.spec.json exactly as before.
// The two `exclude` rules make the file sets disjoint.
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: {
            name: '@memberjunction/ng-flow-editor (node)',
            environment: 'node',
            exclude: ['**/*.dom.test.ts'],
          },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: {
            name: '@memberjunction/ng-flow-editor (dom)',
            include: ['src/**/*.dom.test.ts'],
            exclude: ['**/__tests__/**'],
          },
        }),
      ),
    ],
  },
});
