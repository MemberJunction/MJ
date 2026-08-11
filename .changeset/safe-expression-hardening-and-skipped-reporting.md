---
"@memberjunction/global": patch
"@memberjunction/testing-engine": patch
"@memberjunction/testing-cli": patch
---

Harden `SafeExpressionEvaluator` against a sandbox escape, and correct Skipped-status reporting.

**`SafeExpressionEvaluator` sandbox escape closed.** The denylist matched only dotted/call forms
(`process.`, `Function(`), so bracket-string member access — `globalThis["Function"](...)`,
`x["process"]` — reached host globals and the `Function` constructor: a confirmed arbitrary-code
route from any metadata-authored expression (field rules, flow/loop agent conditions, task-graph
conditions). The dangerous identifiers (`globalThis`, `global`, `process`, `Function`, `eval`,
`require`, `window`, `document`) are now denied as whole words, which also covers the bracket form.
Expressions that referenced those tokens are now rejected at validation.

**Skipped test status wired through reporting.** `MJ: Test Suite Runs` now records `SkippedTests`
and `ErrorTests` (previously left NULL); the CLI single-test and suite-markdown formatters render
Skipped as SKIP rather than FAIL and keep skips out of the Failures section; and the exported
summary aggregator counts skips separately and averages over the executed set.
