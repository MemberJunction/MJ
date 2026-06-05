---
"@memberjunction/react-linter": patch
"@memberjunction/react-runtime": patch
"@memberjunction/react-test-harness": patch
---

feat(react-linter): match `React.useX(...)` member-expression hook calls

The `react-hooks-rules` rule previously matched only bare-identifier hook calls (`useEffect`, `useState`, ...). LLM-generated code routinely emits the `React.useEffect`-style member-expression form, which slipped through entirely. The `CallExpression` visitor now has a parallel branch matching `object='React'` + property in the hooks list. All 5 downstream violation checks (nested-function, conditional, loop, try/catch, early-return-then-hook) now fire on the `React.`-prefixed form too.

feat(react-runtime): emit Babel sourcemaps by default; expose on `CompiledComponent`

`DEFAULT_COMPILER_CONFIG.sourceMaps` is flipped from `false` to `true`. `transpileComponent` now returns `{ code, map }` instead of just the code string, and `compile()` attaches the map to the returned `CompiledComponent` as a new optional `sourceMap` field. Lets downstream tools translate runtime stack-frame line numbers back to original JSX positions.

feat(react-test-harness): preserve runtime stacks; classify hook-rule warnings

- Each compiled component's sourcemap is stashed on `window.__testHarnessSourceMaps[componentName]` and surfaced as a new optional `sourceMaps?: Record<string, any>` field on `ComponentExecutionResult`.
- Runtime errors aggregated from `collectRuntimeErrors` now retain their `stack` and `componentStack` properties (previously stripped during normalization).
- The `console.error` override recognizes React dev-mode Rules-of-Hooks warning strings (`"Rendered more hooks than during the previous render"`, etc.) and promotes them from generic warnings to test-failing critical errors with rule type `'react-hooks-rules'`.
