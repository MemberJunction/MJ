import { defineConfig, mergeConfig, type UserConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

// Dual-preset layout (see ng-pagination's config for the worked example).
//
// The DOM preset (jsdom + analog + zoneless TestBed) is the DEFAULT here, and the node preset is a
// narrow, enumerated exception — deliberately that way round. Two specs, and only two, cannot run
// under the DOM preset: `exports.test.ts` and `index.test.ts` import the FULL public API, which
// trips analog's AOT program (tsconfig.spec.json deliberately includes only the piloted components,
// so everything else stays an unresolved JIT component and TestBed's scoping flush throws). Under
// the node preset those imports are metadata-only and fine.
//
// Everything else belongs on the DOM side, including plain unit specs in `src/__tests__` that never
// touch TestBed. A spec that imports a component MODULE needs a real Angular runtime regardless:
// `flow-editor.component` pulls in `@foblex/mediator`, whose UMD bundle registers a
// partially-compiled injectable AT MODULE-EVAL TIME and so demands `@angular/compiler`. Under node
// that import throws before a single test runs.
//
// WHY THE EXCEPTION LIST IS THE *NODE* SIDE. An earlier revision listed the DOM-side files instead
// and routed `src/__tests__/**` to node by default. That put the burden on whoever adds the next
// spec in that directory — forget the list and it lands under node, where importing any component
// crashes the whole file — and it let a new spec match both projects and run twice. Pinning the two
// known-bad files and defaulting everything else to DOM means a new spec is correct with no edit
// here, and every file runs exactly once.
const NODE_ONLY_SMOKES = ['src/__tests__/exports.test.ts', 'src/__tests__/index.test.ts'];

/**
 * Applies overrides to a shared config, REPLACING array options rather than appending to them.
 *
 * `mergeConfig` concatenates arrays, so `mergeConfig(shared, { test: { include: [...] } })` yields
 * the shared globs PLUS ours — and both shared presets already include
 * `src/**\/__tests__/**\/*.test.ts`, so the result selects every spec instead of narrowing to the
 * two named here. Narrowing an `include` therefore has to overwrite it, which mergeConfig cannot do.
 */
function overrideConfig(base: UserConfig, test: NonNullable<UserConfig['test']>): UserConfig {
    return { ...base, test: { ...base.test, ...test } };
}

export default defineConfig({
  test: {
    projects: [
      overrideConfig(nodeSharedConfig, {
        name: '@memberjunction/ng-flow-editor (node)',
        environment: 'node',
        include: NODE_ONLY_SMOKES,
      }),
      // The DOM side keeps mergeConfig: it only ADDS an exclude, and concatenating excludes is
      // exactly the desired behaviour (the shared node_modules/dist/generated excludes must stay).
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: {
            name: '@memberjunction/ng-flow-editor (dom)',
            exclude: NODE_ONLY_SMOKES,
          },
        }),
      ),
    ],
  },
});
