---
"@memberjunction/core-entities": minor
"@memberjunction/global": patch
"@memberjunction/rubrics-base": minor
"@memberjunction/rubrics": minor
"@memberjunction/ng-rubrics": minor
"@memberjunction/core-entities-server": minor
---

Add the schema for Rubrics, a first-class primitive for evaluating any record against weighted, nested, semantically versioned criteria: rubric definitions (categories, reusable scales, versions, a criteria tree, anchors, bands), immutable evaluations with per-criterion score rows, layered consensus views, agent rubric links, and `RubricID` on tests and test suites plus a persisted `TestSuiteRun.Score`. Deprecates the unused `MJ: Test Rubrics` entity via metadata (`Status = Deprecated`). Design and build plan: `plans/rubrics/RUBRICS_PLAN.md`.

`GeneratePluralName` keeps the head of a name verbatim and pluralizes only the tail, preserving that tail's case. A linear scan finds the tail, so `user_profile` and `userProfile` no longer produce the same view name, a leading character such as Ä stays on the head, and `Contact Person` pluralizes to `Contact People`.
