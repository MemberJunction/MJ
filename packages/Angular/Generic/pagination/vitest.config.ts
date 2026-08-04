import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

/**
 * Second DOM-testing pilot package (Phase 1) — and the worked example of the
 * **dual-preset** layout for a package whose existing class-level specs cannot
 * move to the DOM preset.
 *
 * `src/__tests__/pagination.test.ts` `vi.mock('@angular/core')` so it can test
 * the component as a plain class under the node preset. Under the Angular
 * compile path that mock breaks (`ɵɵdefineComponent` isn't on the mock). Rather
 * than rewrite that perfectly good test, we run TWO vitest projects in one
 * package:
 *   - **node** — the fast, pure-logic class specs in `src/__tests__` (no jsdom,
 *     no Angular compile), exactly as before. Excludes the `*.dom.test.ts`.
 *   - **dom**  — the `*.dom.test.ts` fixture specs (jsdom + analog + zoneless
 *     TestBed). Excludes `__tests__/**` so the @angular/core-mocking spec never
 *     runs under the Angular compile path.
 *
 * The two `exclude` rules make the file sets disjoint (vitest `mergeConfig`
 * concatenates the shared `include`/`exclude` arrays, so we separate by
 * excluding rather than by trying to override `include`).
 *
 * Packages with NO `@angular/core`-mocking node specs don't need this split —
 * they can extend `vitest.dom.shared` directly (see ng-ui-components).
 */
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: {
            name: '@memberjunction/ng-pagination (node)',
            environment: 'node',
            exclude: ['**/*.dom.test.ts'],
          },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: {
            name: '@memberjunction/ng-pagination (dom)',
            include: ['src/**/*.dom.test.ts'],
            exclude: ['**/__tests__/**'],
          },
        }),
      ),
    ],
  },
});
