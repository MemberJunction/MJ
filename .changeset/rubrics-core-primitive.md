---
"@memberjunction/core-entities": minor
"@memberjunction/global": patch
"@memberjunction/rubrics-base": minor
---

Add the schema for Rubrics, a first-class primitive for evaluating any record against weighted, nested, semantically versioned criteria: rubric definitions (categories, reusable scales, versions, a criteria tree, anchors, bands), immutable evaluations with per-criterion score rows, layered consensus views, agent rubric links, and `RubricID` on tests and test suites plus a persisted `TestSuiteRun.Score`. Deprecates the unused `MJ: Test Rubrics` entity via metadata (`Status = Deprecated`). Design and build plan: `plans/rubrics/RUBRICS_PLAN.md`.
