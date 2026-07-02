---
"@memberjunction/ng-testing": patch
---

Fix the Test Run dialog's "Execution Failed" banner rendering empty. The suite and single-test resolver paths (`RunTestResolver`) return `success` + a JSON `result` but never a top-level `errorMessage`, so the banner — bound directly to `result.errorMessage` — showed only the warning icon with no text (and the log printed `Suite failed: undefined`). Added a `failureMessage` getter that falls back through: top-level `errorMessage` → a per-test summary synthesized from the suite result (`N of M tests did not pass`, counting `Failed`/`Error`/`Timeout`, plus the first failing test's name + message) → the single test's own `errorMessage` → a generic "see the execution log" note. The banner and the suite-failed log line now always show meaningful text. Surfaced while running the new Integration Test suites from the dashboard, but applies to every TestType.
