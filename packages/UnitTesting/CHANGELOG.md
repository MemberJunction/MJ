# @memberjunction/unit-testing

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [a5f92d2]
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- f5ec13b: Move the shared LLM conformance suite out of the runtime `@memberjunction/ai` package, and gate silent skip-growth in the integration registry (review fixes for #3542).

  **Conformance suite relocated to `@memberjunction/unit-testing`.** The shared BaseLLM
  streaming/ChatResult conformance suite and its OpenAI-compatible seam mock previously lived in
  `@memberjunction/ai/src/test-support/` and were consumed through a deep `@memberjunction/ai/dist/test-support/*.js`
  import — reaching past the package's public API into its build output, which resolved only because
  `@memberjunction/ai` has no `exports` map, and which shipped test code plus an optional `vitest`
  peer dependency inside the runtime package. Both files (and the suite's own reference regression
  test) now live in `@memberjunction/unit-testing`, are exported from its index
  (`RunLLMConformanceSuite`, `CreateOpenAICompatibleSeamMock`, and their types), and the eight
  provider conformance suites import them from `@memberjunction/unit-testing`. `@memberjunction/ai`
  no longer ships `dist/test-support/*` and no longer declares the optional `vitest` peer. No runtime
  behavior changes; test-only wiring.

  **Skip-growth is now gated, not just reported.** `check-registry.test.ts` gained a snapshot of the
  exact set of checks that self-skip out of the deterministic lane (every `RequiresMutation` and
  `RequiresLiveModel` check across all bundles). A change that makes a check newly self-skip — or
  silently un-gates one — now fails the unit tests with a paste-ready diff, instead of only shrinking
  the CI step-summary. Also corrected a stale `task-graph-execution` count (26 → 27) in the
  all-bundle coverage-loss guard that had drifted after a `next` merge added TX27.

- f5ec13b: Record the new public surface these two packages gained in the test-coverage work so it lands in their changelogs.

  `@memberjunction/unit-testing` now ships the AI test harness — a scriptable `TestLLM` that subclasses the real `BaseLLM`, real-typed `ChatResult` factories, and the realistic catalog fixture — exported from the package index. `@memberjunction/testing-engine-base` adds the optional `skippedChecks`/`skippedTests` fields to `TestRunResult`/`TestSuiteRunResult` that the Skipped-status reporting reads. Both are additive; no runtime behavior changes for existing consumers.

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
- Updated dependencies [cefc302]
- Updated dependencies [be0bdb2]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [080f4cd]
- Updated dependencies [48ff99f]
- Updated dependencies [de343b5]
  - @memberjunction/global@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [9c07270]
  - @memberjunction/global@5.49.0

## 5.48.0

### Patch Changes

- @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [c1f2d3d]
  - @memberjunction/global@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [5396d90]
  - @memberjunction/global@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [9f6aa87]
  - @memberjunction/global@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [0fa3cbc]
  - @memberjunction/global@5.42.0

## 5.41.0

### Patch Changes

- @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [ae74fd5]
  - @memberjunction/global@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [30f598d]
- Updated dependencies [3d739a3]
  - @memberjunction/global@5.38.0

## 5.37.0

### Patch Changes

- @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [ac4b9a5]
  - @memberjunction/global@5.35.0

## 5.34.1

### Patch Changes

- @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [389d356]
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [5cc5326]
  - @memberjunction/global@5.33.0

## 5.32.0

### Patch Changes

- @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
  - @memberjunction/global@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [f2a6bec]
  - @memberjunction/global@5.22.0

## 5.21.0

### Patch Changes

- @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
  - @memberjunction/global@5.13.0

## 5.12.0

### Patch Changes

- @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0

## 5.8.0

### Patch Changes

- @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/global@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [4aa1b54]
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- @memberjunction/global@4.3.0
