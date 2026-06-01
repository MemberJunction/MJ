# @memberjunction/react-test-harness

## 5.38.0

### Minor Changes

- 6f1e483: Allow the React test harness to attach to an already-running browser instead of always launching a throwaway Chromium. Pass `connect` (or set `MJ_REACT_TEST_HARNESS_CONNECT`) with an `http(s)://` endpoint to attach over CDP (`connectOverCDP`) — e.g. a real Chrome started with `--remote-debugging-port` — or a `ws(s)://` endpoint to attach to a Playwright server (`connect`); the method is auto-detected from the scheme, with a `connectType` override for raw CDP websockets. By default a fresh isolated context is created inside the attached browser; opt into `reuseExistingContext` (or `MJ_REACT_TEST_HARNESS_REUSE_CONTEXT=true`) to share the running browser's cookies/auth/session. `BrowserManager.close()` is now ownership-aware: it only closes pages and contexts the harness created and never tears down a browser it merely attached to. Fully backward compatible — with no endpoint the harness still launches its own browser exactly as before.

### Patch Changes

- Updated dependencies [6b6c321]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [d285996]
- Updated dependencies [8bd97f3]
- Updated dependencies [6a3ac36]
- Updated dependencies [918d663]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/aiengine@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/interactive-component-types@5.38.0
  - @memberjunction/sql-dialect@5.38.0
  - @memberjunction/sql-parser@5.38.0
  - @memberjunction/core-entities-server@5.38.0
  - @memberjunction/ai-vectors-memory@5.38.0
  - @memberjunction/react-linter@5.38.0
  - @memberjunction/react-runtime@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [22b775f]
- Updated dependencies [4f15f31]
- Updated dependencies [f5531e0]
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/sql-parser@5.37.0
  - @memberjunction/react-runtime@5.37.0
  - @memberjunction/aiengine@5.37.0
  - @memberjunction/core-entities-server@5.37.0
  - @memberjunction/ai-vectors-memory@5.37.0
  - @memberjunction/interactive-component-types@5.37.0
  - @memberjunction/global@5.37.0
  - @memberjunction/sql-dialect@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/react-runtime@5.36.0
  - @memberjunction/ai-core-plus@5.36.0
  - @memberjunction/aiengine@5.36.0
  - @memberjunction/core-entities-server@5.36.0
  - @memberjunction/ai-vectors-memory@5.36.0
  - @memberjunction/interactive-component-types@5.36.0
  - @memberjunction/global@5.36.0
  - @memberjunction/sql-dialect@5.36.0
  - @memberjunction/sql-parser@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/ai-core-plus@5.35.0
  - @memberjunction/core-entities-server@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/aiengine@5.35.0
  - @memberjunction/ai-vectors-memory@5.35.0
  - @memberjunction/interactive-component-types@5.35.0
  - @memberjunction/react-runtime@5.35.0
  - @memberjunction/sql-dialect@5.35.0
  - @memberjunction/sql-parser@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [8695f65]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/react-runtime@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/aiengine@5.34.1
  - @memberjunction/ai-vectors-memory@5.34.1
  - @memberjunction/interactive-component-types@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/core-entities-server@5.34.1
  - @memberjunction/global@5.34.1
  - @memberjunction/sql-dialect@5.34.1
  - @memberjunction/sql-parser@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- 72cb92e: Optimize component loading pipeline: remove 163 MB MJ: Components bulk load from ComponentMetadataEngine, add ComponentMetadataEngineServer for server-only use, add generic cache API to LocalCacheManager with server-side registry caching (page refresh component load reduced from 12-20s to ~70ms), add hash-based 304 support for registry fetches, remove proprietary spec caching to client database, and optimize Component Studio to load lightweight summaries on demand.
- Updated dependencies [4b8d9ed]
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/core-entities-server@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/aiengine@5.34.0
  - @memberjunction/ai-vectors-memory@5.34.0
  - @memberjunction/interactive-component-types@5.34.0
  - @memberjunction/react-runtime@5.34.0
  - @memberjunction/sql-dialect@5.34.0
  - @memberjunction/sql-parser@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [312fcee]
- Updated dependencies [7e4957d]
- Updated dependencies [7add405]
- Updated dependencies [3e84676]
  - @memberjunction/core@5.33.0
  - @memberjunction/react-runtime@5.33.0
  - @memberjunction/sql-dialect@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/interactive-component-types@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/aiengine@5.33.0
  - @memberjunction/ai-vectors-memory@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/sql-parser@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/aiengine@5.32.0
  - @memberjunction/ai-vectors-memory@5.32.0
  - @memberjunction/interactive-component-types@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/react-runtime@5.32.0
  - @memberjunction/global@5.32.0
  - @memberjunction/sql-dialect@5.32.0
  - @memberjunction/sql-parser@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- 18be074: Fix boundary wildcard stripping in sqlLike filters, fix QueryProcessor default value handling for array-typed parameters, add Chart.js canvas container and no-unwrap-utility-libs lint rules to react-test-harness, and fix SimpleChart label leak through onDataPointClick
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [84494bb]
- Updated dependencies [9457655]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [c8b6f8a]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/aiengine@5.31.0
  - @memberjunction/ai-vectors-memory@5.31.0
  - @memberjunction/interactive-component-types@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/react-runtime@5.31.0
  - @memberjunction/sql-dialect@5.31.0
  - @memberjunction/sql-parser@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/aiengine@5.30.1
- @memberjunction/ai-vectors-memory@5.30.1
- @memberjunction/interactive-component-types@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/react-runtime@5.30.1
- @memberjunction/sql-dialect@5.30.1
- @memberjunction/sql-parser@5.30.1

## 5.30.0

### Patch Changes

- 366e646: Refactor component linter: extract rules into self-registering individual files, then consolidate overlapping rules from 63 down to 55 (including merging 10 RunView/RunQuery rules into 3). Add search utility validation rules, improve render-loop detection with rate-of-growth analysis, fix variable reference resolution in RunQuery parameters, and fix @babel/traverse ESM default imports. Enhance TypeInferenceEngine with useState/callback/setState type propagation, implement 3-tier metadata fallback (spec → registry → skip-with-warning), and add individual-test-per-fixture for clear regression debugging. Includes architecture documentation updates.
- 735a618: Component linter bug fixes and new rules: fix false positives on multi-component tree query delegation, SQL injection detection, datagrid computed fields, and optional chaining; consolidate duplicated utilities into shared lint-utils; add event-parameter-validation rule that catches wrong event property access (e.g., e.data vs e.record); replace substring SQL keyword matching with structural pattern detection.
- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [00b5c26]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/aiengine@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/interactive-component-types@5.30.0
  - @memberjunction/react-runtime@5.30.0
  - @memberjunction/ai-vectors-memory@5.30.0
  - @memberjunction/global@5.30.0
  - @memberjunction/sql-dialect@5.30.0
  - @memberjunction/sql-parser@5.30.0

## 5.29.0

### Patch Changes

- e02e24e: Query rendering pipeline redesign: fix Bug D (Nunjucks expression inside SQL string literal breaks ORDER BY detection), consolidate duplicated ORDER BY logic into shared analyzer, add RenderPipeline entry point with diagnostic tracing, introduce structural parser and symbol table for composition IR, and integrate SQL dialect objects throughout the parser removing all hardcoded dialect switch statements. SQL comments are now stripped before template evaluation instead of escaped. Production callers (RunQuery, TestQuerySQL) delegate to RenderPipeline. 65+ new tests including recursive CTEs, PostgreSQL dialect variants, and comment-stripping coverage.

  Query dashboard and form UI improvements: replace flat category dropdowns with hierarchical tree dropdowns, default new query category to active folder context, add per-folder create buttons, expose Reusable/CacheEnabled/AuditQueryRuns fields in entity form Details panel, add saving indicator with spinner overlay, fix sub-entity delete by reloading fresh entity copies, and fix tree dropdown not showing pre-selected text for branch-only configurations. Fix extraction pipeline not cleaning up stale Query Fields and Query Entities when extraction produces no results, with 9 regression tests.

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/sql-dialect@5.29.0
  - @memberjunction/sql-parser@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/aiengine@5.29.0
  - @memberjunction/ai-vectors-memory@5.29.0
  - @memberjunction/interactive-component-types@5.29.0
  - @memberjunction/react-runtime@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- 1a6b1af: Adds an onPageReady callback to ComponentExecutionOptions so callers can drive post-render interactions on the live Playwright page (clicks, form fills, etc.) before the harness tears down. Errors inside the callback are caught and appended to result.errors instead of aborting the run.

  Adds a fullPageScreenshot flag that forwards fullPage: true to page.screenshot(), capturing the entire scrollable content for tall components (dashboards, long forms) that overflow the viewport. Defaults to false to preserve existing behavior.

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/aiengine@5.28.0
  - @memberjunction/ai-vectors-memory@5.28.0
  - @memberjunction/interactive-component-types@5.28.0
  - @memberjunction/react-runtime@5.28.0
  - @memberjunction/global@5.28.0
  - @memberjunction/sql-parser@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/aiengine@5.27.1
  - @memberjunction/ai-vectors-memory@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/react-runtime@5.27.1
  - @memberjunction/interactive-component-types@5.27.1
  - @memberjunction/sql-parser@5.27.1

## 5.27.0

### Patch Changes

- Updated dependencies [4357090]
  - @memberjunction/sql-parser@5.27.0
  - @memberjunction/ai-core-plus@5.27.0
  - @memberjunction/aiengine@5.27.0
  - @memberjunction/ai-vectors-memory@5.27.0
  - @memberjunction/interactive-component-types@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0
  - @memberjunction/global@5.27.0
  - @memberjunction/react-runtime@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/aiengine@5.26.0
  - @memberjunction/react-runtime@5.26.0
  - @memberjunction/ai-vectors-memory@5.26.0
  - @memberjunction/interactive-component-types@5.26.0
  - @memberjunction/global@5.26.0
  - @memberjunction/sql-parser@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [a24ff53]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/interactive-component-types@5.25.0
  - @memberjunction/sql-parser@5.25.0
  - @memberjunction/react-runtime@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/aiengine@5.25.0
  - @memberjunction/ai-vectors-memory@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Minor Changes

- c318a0c: metadata + migrations in this PR == minor

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/ai-vectors-memory@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/react-runtime@5.24.0
  - @memberjunction/aiengine@5.24.0
  - @memberjunction/interactive-component-types@5.24.0
  - @memberjunction/global@5.24.0
  - @memberjunction/sql-parser@5.24.0

## 5.23.0

### Patch Changes

- c17be20: no migration/metadata
- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [1d1e02e]
- Updated dependencies [c17be20]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/ai-vectors-memory@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/react-runtime@5.23.0
  - @memberjunction/aiengine@5.23.0
  - @memberjunction/interactive-component-types@5.23.0
  - @memberjunction/sql-parser@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [a42aba6]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/sql-parser@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/ai-vectors-memory@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/aiengine@5.22.0
  - @memberjunction/interactive-component-types@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/react-runtime@5.22.0

## 5.21.0

### Patch Changes

- 2585d4d: Skip required-queries-not-called lint rule for child-delegated queries in test harness
- Updated dependencies [c7dfb20]
- Updated dependencies [76cd2bc]
  - @memberjunction/ai-vectors-memory@5.21.0
  - @memberjunction/core@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/aiengine@5.21.0
  - @memberjunction/interactive-component-types@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/react-runtime@5.21.0
  - @memberjunction/global@5.21.0
  - @memberjunction/sql-parser@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/aiengine@5.20.0
  - @memberjunction/ai-vectors-memory@5.20.0
  - @memberjunction/interactive-component-types@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/react-runtime@5.20.0
  - @memberjunction/global@5.20.0
  - @memberjunction/sql-parser@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai-core-plus@5.19.0
- @memberjunction/aiengine@5.19.0
- @memberjunction/ai-vectors-memory@5.19.0
- @memberjunction/interactive-component-types@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/react-runtime@5.19.0
- @memberjunction/sql-parser@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [322dac6]
- Updated dependencies [931740a]
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/sql-parser@5.18.0
  - @memberjunction/aiengine@5.18.0
  - @memberjunction/react-runtime@5.18.0
  - @memberjunction/ai-vectors-memory@5.18.0
  - @memberjunction/interactive-component-types@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [4b6fd2a]
- Updated dependencies [9881045]
  - @memberjunction/sql-parser@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/react-runtime@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/aiengine@5.17.0
  - @memberjunction/ai-vectors-memory@5.17.0
  - @memberjunction/interactive-component-types@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ai-core-plus@5.16.0
  - @memberjunction/aiengine@5.16.0
  - @memberjunction/ai-vectors-memory@5.16.0
  - @memberjunction/interactive-component-types@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/react-runtime@5.16.0
  - @memberjunction/global@5.16.0
  - @memberjunction/sql-parser@5.16.0

## 5.15.0

### Patch Changes

- d01f697: MJ SQL Parser: unified parser for SQL + Nunjucks templates + composition tokens. Replaces fragmented regex-based SQL parsing across 6 packages with a single MJSQLParser class providing AST-based tokenization, placeholder substitution, CTE extraction, ORDER BY remapping, and deterministic parameter/field extraction. Moves QueryPagingEngine from MJCore to GenericDatabaseProvider with AST-based paging. Fixes backtick quoting, table-qualified ORDER BY remapping, trailing semicolon, and FOR XML parsing bugs.
- Updated dependencies [662d56b]
- Updated dependencies [5e85b29]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/core@5.15.0
  - @memberjunction/sql-parser@5.15.0
  - @memberjunction/ai-core-plus@5.15.0
  - @memberjunction/aiengine@5.15.0
  - @memberjunction/ai-vectors-memory@5.15.0
  - @memberjunction/interactive-component-types@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/react-runtime@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/ai-core-plus@5.14.0
  - @memberjunction/aiengine@5.14.0
  - @memberjunction/ai-vectors-memory@5.14.0
  - @memberjunction/interactive-component-types@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/react-runtime@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ai-core-plus@5.13.0
  - @memberjunction/aiengine@5.13.0
  - @memberjunction/ai-vectors-memory@5.13.0
  - @memberjunction/interactive-component-types@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/react-runtime@5.13.0

## 5.12.0

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/aiengine@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ai-core-plus@5.12.0
  - @memberjunction/ai-vectors-memory@5.12.0
  - @memberjunction/interactive-component-types@5.12.0
  - @memberjunction/react-runtime@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/react-runtime@5.11.0
  - @memberjunction/ai-core-plus@5.11.0
  - @memberjunction/aiengine@5.11.0
  - @memberjunction/ai-vectors-memory@5.11.0
  - @memberjunction/interactive-component-types@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai-core-plus@5.10.1
- @memberjunction/aiengine@5.10.1
- @memberjunction/ai-vectors-memory@5.10.1
- @memberjunction/interactive-component-types@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/react-runtime@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ai-core-plus@5.10.0
  - @memberjunction/aiengine@5.10.0
  - @memberjunction/ai-vectors-memory@5.10.0
  - @memberjunction/interactive-component-types@5.10.0
  - @memberjunction/react-runtime@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ai-core-plus@5.9.0
  - @memberjunction/aiengine@5.9.0
  - @memberjunction/react-runtime@5.9.0
  - @memberjunction/ai-vectors-memory@5.9.0
  - @memberjunction/interactive-component-types@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/react-runtime@5.8.0
  - @memberjunction/ai-core-plus@5.8.0
  - @memberjunction/aiengine@5.8.0
  - @memberjunction/ai-vectors-memory@5.8.0
  - @memberjunction/interactive-component-types@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/ai-core-plus@5.7.0
  - @memberjunction/aiengine@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/ai-vectors-memory@5.7.0
  - @memberjunction/interactive-component-types@5.7.0
  - @memberjunction/react-runtime@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ai-core-plus@5.6.0
  - @memberjunction/aiengine@5.6.0
  - @memberjunction/ai-vectors-memory@5.6.0
  - @memberjunction/interactive-component-types@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/react-runtime@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/react-runtime@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ai-core-plus@5.5.0
  - @memberjunction/aiengine@5.5.0
  - @memberjunction/ai-vectors-memory@5.5.0
  - @memberjunction/interactive-component-types@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai-core-plus@5.4.1
- @memberjunction/aiengine@5.4.1
- @memberjunction/ai-vectors-memory@5.4.1
- @memberjunction/interactive-component-types@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1
- @memberjunction/react-runtime@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/react-runtime@5.4.0
  - @memberjunction/ai-core-plus@5.4.0
  - @memberjunction/aiengine@5.4.0
  - @memberjunction/ai-vectors-memory@5.4.0
  - @memberjunction/interactive-component-types@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-core-plus@5.3.1
- @memberjunction/aiengine@5.3.1
- @memberjunction/ai-vectors-memory@5.3.1
- @memberjunction/interactive-component-types@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1
- @memberjunction/react-runtime@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [a6aea29]
- Updated dependencies [1692c53]
  - @memberjunction/react-runtime@5.3.0
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ai-core-plus@5.3.0
  - @memberjunction/aiengine@5.3.0
  - @memberjunction/ai-vectors-memory@5.3.0
  - @memberjunction/interactive-component-types@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/ai-core-plus@5.2.0
  - @memberjunction/aiengine@5.2.0
  - @memberjunction/react-runtime@5.2.0
  - @memberjunction/ai-vectors-memory@5.2.0
  - @memberjunction/interactive-component-types@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai-core-plus@5.1.0
  - @memberjunction/aiengine@5.1.0
  - @memberjunction/ai-vectors-memory@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/react-runtime@5.1.0
  - @memberjunction/interactive-component-types@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [737b56b]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/interactive-component-types@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ai-core-plus@5.0.0
  - @memberjunction/aiengine@5.0.0
  - @memberjunction/ai-vectors-memory@5.0.0
  - @memberjunction/global@5.0.0
  - @memberjunction/react-runtime@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-core-plus@4.4.0
  - @memberjunction/aiengine@4.4.0
  - @memberjunction/ai-vectors-memory@4.4.0
  - @memberjunction/interactive-component-types@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/react-runtime@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai-core-plus@4.3.1
- @memberjunction/aiengine@4.3.1
- @memberjunction/ai-vectors-memory@4.3.1
- @memberjunction/interactive-component-types@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1
- @memberjunction/react-runtime@4.3.1

## 4.3.0

### Patch Changes

- 7b39671: Fix LocalEmbeddings retry logging with cleaner user-friendly output and resolve ESM compatibility issues for React packages after MJ 4.0 upgrade
- Updated dependencies [564e1af]
- Updated dependencies [7b39671]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/react-runtime@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/aiengine@4.3.0
  - @memberjunction/ai-vectors-memory@4.3.0
  - @memberjunction/interactive-component-types@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai-core-plus@4.2.0
- @memberjunction/aiengine@4.2.0
- @memberjunction/ai-vectors-memory@4.2.0
- @memberjunction/interactive-component-types@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0
- @memberjunction/react-runtime@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ai-core-plus@4.1.0
  - @memberjunction/aiengine@4.1.0
  - @memberjunction/ai-vectors-memory@4.1.0
  - @memberjunction/interactive-component-types@4.1.0
  - @memberjunction/react-runtime@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [2f86270]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/aiengine@4.0.0
  - @memberjunction/ai-core-plus@4.0.0
  - @memberjunction/ai-vectors-memory@4.0.0
  - @memberjunction/interactive-component-types@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0
  - @memberjunction/react-runtime@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/aiengine@3.4.0
  - @memberjunction/ai-core-plus@3.4.0
  - @memberjunction/react-runtime@3.4.0
  - @memberjunction/ai-vectors-memory@3.4.0
  - @memberjunction/interactive-component-types@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/ai-core-plus@3.3.0
  - @memberjunction/aiengine@3.3.0
  - @memberjunction/react-runtime@3.3.0
  - @memberjunction/ai-vectors-memory@3.3.0
  - @memberjunction/interactive-component-types@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- cbd2714: Improve error handling and stability across Skip integration, component artifacts, and metadata sync
- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [cbd2714]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/interactive-component-types@3.2.0
  - @memberjunction/ai-core-plus@3.2.0
  - @memberjunction/aiengine@3.2.0
  - @memberjunction/react-runtime@3.2.0
  - @memberjunction/ai-vectors-memory@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/react-runtime@3.1.1
- @memberjunction/ai-core-plus@3.1.1
- @memberjunction/aiengine@3.1.1
- @memberjunction/ai-vectors-memory@3.1.1
- @memberjunction/interactive-component-types@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai-core-plus@3.0.0
- @memberjunction/aiengine@3.0.0
- @memberjunction/ai-vectors-memory@3.0.0
- @memberjunction/interactive-component-types@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0
- @memberjunction/react-runtime@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/ai-core-plus@2.133.0
  - @memberjunction/aiengine@2.133.0
  - @memberjunction/ai-vectors-memory@2.133.0
  - @memberjunction/interactive-component-types@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/react-runtime@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ai-core-plus@2.132.0
  - @memberjunction/aiengine@2.132.0
  - @memberjunction/ai-vectors-memory@2.132.0
  - @memberjunction/interactive-component-types@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/react-runtime@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/ai-core-plus@2.131.0
  - @memberjunction/aiengine@2.131.0
  - @memberjunction/ai-vectors-memory@2.131.0
  - @memberjunction/interactive-component-types@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/react-runtime@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ai-core-plus@2.130.1
- @memberjunction/aiengine@2.130.1
- @memberjunction/ai-vectors-memory@2.130.1
- @memberjunction/interactive-component-types@2.130.1
- @memberjunction/core@2.130.1
- @memberjunction/core-entities@2.130.1
- @memberjunction/global@2.130.1
- @memberjunction/react-runtime@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/ai-core-plus@2.130.0
  - @memberjunction/aiengine@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/react-runtime@2.130.0
  - @memberjunction/ai-vectors-memory@2.130.0
  - @memberjunction/interactive-component-types@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Minor Changes

- f7267c3: migration

### Patch Changes

- 4b250f8: no migration
- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [f7267c3]
- Updated dependencies [fbae243]
- Updated dependencies [6ce6e67]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/react-runtime@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/ai-core-plus@2.129.0
  - @memberjunction/aiengine@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/ai-vectors-memory@2.129.0
  - @memberjunction/interactive-component-types@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/aiengine@2.128.0
  - @memberjunction/ai-vectors-memory@2.128.0
  - @memberjunction/interactive-component-types@2.128.0
  - @memberjunction/react-runtime@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [65318c4]
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/interactive-component-types@2.127.0
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/react-runtime@2.127.0
  - @memberjunction/aiengine@2.127.0
  - @memberjunction/ai-vectors-memory@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/react-runtime@2.126.1
- @memberjunction/aiengine@2.126.1
- @memberjunction/ai-vectors-memory@2.126.1
- @memberjunction/interactive-component-types@2.126.1
- @memberjunction/core@2.126.1
- @memberjunction/core-entities@2.126.1
- @memberjunction/global@2.126.1

## 2.126.0

### Patch Changes

- eae1a1f: Add Phase B component linter fixtures, reorganize test structure, refactor financial analytics components, and fix OpenEntityRecord event propagation in artifacts and collections
- Updated dependencies [703221e]
  - @memberjunction/core@2.126.0
  - @memberjunction/aiengine@2.126.0
  - @memberjunction/ai-vectors-memory@2.126.0
  - @memberjunction/interactive-component-types@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/react-runtime@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [1115143]
- Updated dependencies [bd4aa3d]
  - @memberjunction/interactive-component-types@2.125.0
  - @memberjunction/react-runtime@2.125.0
  - @memberjunction/core@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/aiengine@2.125.0
  - @memberjunction/ai-vectors-memory@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/aiengine@2.124.0
  - @memberjunction/ai-vectors-memory@2.124.0
  - @memberjunction/interactive-component-types@2.124.0
  - @memberjunction/react-runtime@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/aiengine@2.123.1
- @memberjunction/ai-vectors-memory@2.123.1
- @memberjunction/interactive-component-types@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/react-runtime@2.123.1

## 2.123.0

### Patch Changes

- 52cf482: Fix conversation state reference after service refactor, improve component linter test structure, and fix chart ordering
  - @memberjunction/aiengine@2.123.0
  - @memberjunction/react-runtime@2.123.0
  - @memberjunction/ai-vectors-memory@2.123.0
  - @memberjunction/interactive-component-types@2.123.0
  - @memberjunction/core@2.123.0
  - @memberjunction/core-entities@2.123.0

## 2.122.2

### Patch Changes

- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [81f0c44]
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/react-runtime@2.122.2
  - @memberjunction/aiengine@2.122.2
  - @memberjunction/ai-vectors-memory@2.122.2
  - @memberjunction/interactive-component-types@2.122.2
  - @memberjunction/core@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/interactive-component-types@2.122.1
- @memberjunction/core@2.122.1
- @memberjunction/react-runtime@2.122.1

## 2.122.0

### Patch Changes

- 6de83ec: Add component linter enhancements with type inference and control flow analysis, DBAutoDoc query generation features, MCP server diagnostic tools, metadata sync improvements, and enhanced JWKS client with HTTP keep-alive connections and connection pooling to prevent socket hangups
- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/interactive-component-types@2.122.0
  - @memberjunction/react-runtime@2.122.0

## 2.121.0

### Patch Changes

- a2bef0a: Refactor component-linter with fixture-based testing infrastructure, fix agent execution error handling and payload propagation, add Gemini API parameter fixes, and improve vendor failover with VendorValidationError type
- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/interactive-component-types@2.121.0
  - @memberjunction/react-runtime@2.121.0

## 2.120.0

### Patch Changes

- 3074b66: Add agent run auditing and debugging tools, enhance AI agent execution history with search and pagination, improve query parameter extraction and validation, and add linter validation for missing query names
- 60a1831: Fix WebSocket subscription lifecycle management in GraphQL data provider, add Gemini 3 Pro model with 1M token context window, enhance component linter to detect invalid property access on RunQuery/RunView results, and fix testing dashboard dialog rendering issues
- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/interactive-component-types@2.120.0
  - @memberjunction/react-runtime@2.120.0

## 2.119.0

### Patch Changes

- Updated dependencies [7dd7cca]
  - @memberjunction/core@2.119.0
  - @memberjunction/interactive-component-types@2.119.0
  - @memberjunction/react-runtime@2.119.0

## 2.118.0

### Patch Changes

- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
  - @memberjunction/interactive-component-types@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/react-runtime@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
  - @memberjunction/core@2.117.0
  - @memberjunction/interactive-component-types@2.117.0
  - @memberjunction/react-runtime@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [81bb7a4]
  - @memberjunction/core@2.116.0
  - @memberjunction/interactive-component-types@2.116.0
  - @memberjunction/react-runtime@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/interactive-component-types@2.115.0
- @memberjunction/core@2.115.0
- @memberjunction/react-runtime@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/interactive-component-types@2.114.0
- @memberjunction/core@2.114.0
- @memberjunction/react-runtime@2.114.0

## 2.113.2

### Patch Changes

- @memberjunction/interactive-component-types@2.113.2
- @memberjunction/react-runtime@2.113.2

## 2.112.0

### Patch Changes

- @memberjunction/react-runtime@2.112.0
- @memberjunction/interactive-component-types@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/interactive-component-types@2.110.1
- @memberjunction/react-runtime@2.110.1

## 2.110.0

### Patch Changes

- @memberjunction/react-runtime@2.110.0
- @memberjunction/interactive-component-types@2.110.0

## 2.109.0

### Patch Changes

- @memberjunction/react-runtime@2.109.0
- @memberjunction/interactive-component-types@2.109.0

## 2.108.0

### Patch Changes

- 748bd8b: Add Run query missing category path lint rule to require a CategoryPath in the RunQuery Params when QueryName is provided.
  - @memberjunction/react-runtime@2.108.0
  - @memberjunction/interactive-component-types@2.108.0

## 2.107.0

### Patch Changes

- b4a7797: Update Component Linter rules for RunQuery
  - @memberjunction/interactive-component-types@2.107.0
  - @memberjunction/react-runtime@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/interactive-component-types@2.106.0
- @memberjunction/react-runtime@2.106.0

## 2.105.0

### Patch Changes

- @memberjunction/react-runtime@2.105.0
- @memberjunction/interactive-component-types@2.105.0

## 2.104.0

### Patch Changes

- Updated dependencies [4567af3]
  - @memberjunction/react-runtime@2.104.0
  - @memberjunction/interactive-component-types@2.104.0

## 2.103.0

### Patch Changes

- 9358ccd: Improved linting for RunQuery
- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
  - @memberjunction/react-runtime@2.103.0
  - @memberjunction/interactive-component-types@2.103.0

## 2.100.3

### Patch Changes

- 3cec75a: CreateSimpleNotification added up and down stack
- Updated dependencies [3cec75a]
  - @memberjunction/interactive-component-types@2.100.3
  - @memberjunction/react-runtime@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/interactive-component-types@2.100.2
- @memberjunction/react-runtime@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/interactive-component-types@2.100.1
- @memberjunction/react-runtime@2.100.1

## 2.100.0

### Patch Changes

- 6dfe03c: tweaks
- Updated dependencies [6dfe03c]
  - @memberjunction/react-runtime@2.100.0
  - @memberjunction/interactive-component-types@2.100.0

## 2.99.0

### Patch Changes

- 5af2d74: updates to react runtime
- Updated dependencies [5af2d74]
  - @memberjunction/react-runtime@2.99.0
  - @memberjunction/interactive-component-types@2.99.0

## 2.98.0

### Minor Changes

- ce949f4: migration

### Patch Changes

- 56a4e9d: tweaks to linter
- Updated dependencies [56a4e9d]
- Updated dependencies [ce949f4]
  - @memberjunction/react-runtime@2.98.0
  - @memberjunction/interactive-component-types@2.98.0

## 2.97.0

### Minor Changes

- dc497d5: migration

### Patch Changes

- Updated dependencies [dc497d5]
  - @memberjunction/interactive-component-types@2.97.0
  - @memberjunction/react-runtime@2.97.0

## 2.96.0

### Minor Changes

- 8f34e55: migration
- 22e365f: migration
- ad06a79: migration
- 8e1c946: migration

### Patch Changes

- a3d32ec: tweaks
- Updated dependencies [8f34e55]
- Updated dependencies [22e365f]
- Updated dependencies [a3d32ec]
- Updated dependencies [ad06a79]
- Updated dependencies [8e1c946]
  - @memberjunction/react-runtime@2.96.0
  - @memberjunction/interactive-component-types@2.96.0

## 2.95.0

### Patch Changes

- 3cd7db6: fix rendering issue
- Updated dependencies [3cd7db6]
- Updated dependencies [85985bd]
  - @memberjunction/react-runtime@2.95.0
  - @memberjunction/interactive-component-types@2.95.0

## 2.94.0

### Minor Changes

- 7c27b04: migration
- 98afc80: migrations

### Patch Changes

- Updated dependencies [455654e]
- Updated dependencies [7c27b04]
- Updated dependencies [98afc80]
- Updated dependencies [eed16e0]
  - @memberjunction/react-runtime@2.94.0
  - @memberjunction/interactive-component-types@2.94.0

## 2.93.0

### Patch Changes

- f8757aa: bug fixes
- bfcd737: Refactoring and new AI functionality
- Updated dependencies [bfcd737]
- Updated dependencies [1461a44]
  - @memberjunction/interactive-component-types@2.93.0
  - @memberjunction/react-runtime@2.93.0

## 2.92.0

### Minor Changes

- b303b84: migrations

### Patch Changes

- 3f61d1a: linter rule changes
- Updated dependencies [b303b84]
  - @memberjunction/interactive-component-types@2.92.0
  - @memberjunction/react-runtime@2.92.0

## 2.91.0

### Minor Changes

- 6476d74: migrations

### Patch Changes

- Updated dependencies [6476d74]
  - @memberjunction/react-runtime@2.91.0
  - @memberjunction/interactive-component-types@2.91.0

## 2.90.0

### Minor Changes

- 187527b: migration
- da3eb4f: migration

### Patch Changes

- 55bc586: changed testing approach
- Updated dependencies [d4530d7]
- Updated dependencies [187527b]
- Updated dependencies [da3eb4f]
  - @memberjunction/interactive-component-types@2.90.0
  - @memberjunction/react-runtime@2.90.0

## 2.89.0

### Patch Changes

- @memberjunction/interactive-component-types@2.89.0
- @memberjunction/react-runtime@2.89.0

## 2.88.0

### Patch Changes

- @memberjunction/interactive-component-types@2.88.0
- @memberjunction/react-runtime@2.88.0

## 2.87.0

### Patch Changes

- @memberjunction/interactive-component-types@2.87.0
- @memberjunction/react-runtime@2.87.0

## 2.86.0

### Patch Changes

- @memberjunction/interactive-component-types@2.86.0
- @memberjunction/react-runtime@2.86.0

## 2.85.0

### Patch Changes

- @memberjunction/interactive-component-types@2.85.0
- @memberjunction/react-runtime@2.85.0

## 2.84.0

### Patch Changes

- @memberjunction/interactive-component-types@2.84.0
- @memberjunction/react-runtime@2.84.0

## 2.83.0

### Patch Changes

- 87f7308: registration improvements
- 7fef004: Improved Static Linter
- Updated dependencies [87f7308]
  - @memberjunction/react-runtime@2.83.0
  - @memberjunction/interactive-component-types@2.83.0

## 2.82.0

### Patch Changes

- 1d8ad58: improve static linter
  - @memberjunction/interactive-component-types@2.82.0
  - @memberjunction/react-runtime@2.82.0

## 2.81.0

### Patch Changes

- @memberjunction/interactive-component-types@2.81.0
- @memberjunction/react-runtime@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/interactive-component-types@2.80.1
- @memberjunction/react-runtime@2.80.1

## 2.80.0

### Patch Changes

- 01bd43e: fix static linter to align with new component rules
  - @memberjunction/interactive-component-types@2.80.0
  - @memberjunction/react-runtime@2.80.0

## 2.79.0

### Patch Changes

- @memberjunction/react-runtime@2.79.0
- @memberjunction/interactive-component-types@2.79.0

## 2.78.0

### Patch Changes

- @memberjunction/interactive-component-types@2.78.0
- @memberjunction/react-runtime@2.78.0

## 2.77.0

### Patch Changes

- @memberjunction/interactive-component-types@2.77.0
- @memberjunction/react-runtime@2.77.0

## 2.76.0

### Minor Changes

- ffda243: migration

### Patch Changes

- 1745e86: liunt fix
- 2e4ed28: new linter
- Updated dependencies [ffda243]
  - @memberjunction/react-runtime@2.76.0
  - @memberjunction/interactive-component-types@2.76.0

## 2.75.0

### Minor Changes

- 9ccd145: migration

### Patch Changes

- 0da7b51: tweaks to types
- Updated dependencies [9ccd145]
- Updated dependencies [0da7b51]
- Updated dependencies [b403003]
  - @memberjunction/react-runtime@2.75.0
  - @memberjunction/interactive-component-types@2.75.0

## 2.74.0

### Patch Changes

- 56230ee: contextUser bug fix
  - @memberjunction/interactive-component-types@2.74.0
  - @memberjunction/react-runtime@2.74.0

## 2.73.0

### Minor Changes

- eab6a48: migration files

### Patch Changes

- @memberjunction/interactive-component-types@2.73.0
- @memberjunction/react-runtime@2.73.0

## 2.72.0

### Patch Changes

- @memberjunction/interactive-component-types@2.72.0
- @memberjunction/react-runtime@2.72.0

## 2.71.0

### Minor Changes

- 91188ab: migration file + various improvements and reorganization

### Patch Changes

- Updated dependencies [062918f]
- Updated dependencies [91188ab]
  - @memberjunction/react-runtime@2.71.0
  - @memberjunction/interactive-component-types@2.71.0

## 2.70.0

### Patch Changes

- @memberjunction/react-runtime@2.70.0
