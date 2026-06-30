# @memberjunction/react-linter

## 5.43.0

### Patch Changes

- a975e3d: Eliminate React linter form-lifecycle false positives and guard against no-op saves in the interactive form component.
- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [b98366b]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/sql-dialect@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/interactive-component-types@5.43.0
  - @memberjunction/react-runtime@5.43.0
  - @memberjunction/sql-parser@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [438ce4a]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/react-runtime@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/interactive-component-types@5.42.0
  - @memberjunction/sql-dialect@5.42.0
  - @memberjunction/sql-parser@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [cd6c5f0]
- Updated dependencies [133dfa7]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/react-runtime@5.41.0
  - @memberjunction/interactive-component-types@5.41.0
  - @memberjunction/global@5.41.0
  - @memberjunction/sql-dialect@5.41.0
  - @memberjunction/sql-parser@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/interactive-component-types@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/react-runtime@5.40.2
- @memberjunction/sql-dialect@5.40.2
- @memberjunction/sql-parser@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/interactive-component-types@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/react-runtime@5.40.1
  - @memberjunction/global@5.40.1
  - @memberjunction/sql-dialect@5.40.1
  - @memberjunction/sql-parser@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/interactive-component-types@5.40.0
  - @memberjunction/react-runtime@5.40.0
  - @memberjunction/global@5.40.0
  - @memberjunction/sql-dialect@5.40.0
  - @memberjunction/sql-parser@5.40.0

## 5.39.0

### Patch Changes

- 315ff4d: feat(react-linter): match `React.useX(...)` member-expression hook calls

  The `react-hooks-rules` rule previously matched only bare-identifier hook calls (`useEffect`, `useState`, ...). LLM-generated code routinely emits the `React.useEffect`-style member-expression form, which slipped through entirely. The `CallExpression` visitor now has a parallel branch matching `object='React'` + property in the hooks list. All 5 downstream violation checks (nested-function, conditional, loop, try/catch, early-return-then-hook) now fire on the `React.`-prefixed form too.

  feat(react-runtime): emit Babel sourcemaps by default; expose on `CompiledComponent`

  `DEFAULT_COMPILER_CONFIG.sourceMaps` is flipped from `false` to `true`. `transpileComponent` now returns `{ code, map }` instead of just the code string, and `compile()` attaches the map to the returned `CompiledComponent` as a new optional `sourceMap` field. Lets downstream tools translate runtime stack-frame line numbers back to original JSX positions.

  feat(react-test-harness): preserve runtime stacks; classify hook-rule warnings
  - Each compiled component's sourcemap is stashed on `window.__testHarnessSourceMaps[componentName]` and surfaced as a new optional `sourceMaps?: Record<string, any>` field on `ComponentExecutionResult`.
  - Runtime errors aggregated from `collectRuntimeErrors` now retain their `stack` and `componentStack` properties (previously stripped during normalization).
  - The `console.error` override recognizes React dev-mode Rules-of-Hooks warning strings (`"Rendered more hooks than during the previous render"`, etc.) and promotes them from generic warnings to test-failing critical errors with rule type `'react-hooks-rules'`.

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [315ff4d]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/react-runtime@5.39.0
  - @memberjunction/interactive-component-types@5.39.0
  - @memberjunction/sql-dialect@5.39.0
  - @memberjunction/sql-parser@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [d285996]
- Updated dependencies [6a3ac36]
- Updated dependencies [918d663]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/interactive-component-types@5.38.0
  - @memberjunction/sql-dialect@5.38.0
  - @memberjunction/sql-parser@5.38.0
  - @memberjunction/react-runtime@5.38.0
