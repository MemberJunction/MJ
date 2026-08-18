---
"@memberjunction/unit-testing": patch
"@memberjunction/testing-engine-base": patch
---

Record the new public surface these two packages gained in the test-coverage work so it lands in their changelogs.

`@memberjunction/unit-testing` now ships the AI test harness — a scriptable `TestLLM` that subclasses the real `BaseLLM`, real-typed `ChatResult` factories, and the realistic catalog fixture — exported from the package index. `@memberjunction/testing-engine-base` adds the optional `skippedChecks`/`skippedTests` fields to `TestRunResult`/`TestSuiteRunResult` that the Skipped-status reporting reads. Both are additive; no runtime behavior changes for existing consumers.
