---
"@memberjunction/react-linter": minor
---

Library lint validators and runtime rules no longer crash or flood the log:
- **One log line per failing validator.** A failing library validator now logs once per lint, with its error message and the number of AST nodes it failed on. Before, it logged `{}` once per node: 25,742 lines in one Skip eval run.
- **No crash without a component name.** `LintComponent` falls back to the spec's name when the caller passes none. `no-data-prop` and `component-name-mismatch` return early instead of throwing on a missing name. The mismatch rule no longer raises a false critical violation.
