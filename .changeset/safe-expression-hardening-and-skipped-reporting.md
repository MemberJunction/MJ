---
"@memberjunction/global": patch
"@memberjunction/testing-engine": patch
"@memberjunction/testing-cli": patch
---

Harden `SafeExpressionEvaluator` against a sandbox escape, and correct Skipped-status reporting.

**`SafeExpressionEvaluator` sandbox escape closed.** The previous defense was a textual denylist,
which a split-token expression walked straight through:
`[]["cons"+"tructor"]["cons"+"tructor"]("return process.pid")()` spells none of the banned words yet
climbs `[].constructor.constructor` to the `Function` constructor and reaches `process` — a
confirmed arbitrary-code route from any metadata-authored expression (field rules, flow/loop agent
conditions, task-graph conditions). Validation is now a **structural AST allowlist**: the expression
is parsed and every node checked before compilation, rejecting computed member access whose key is
not a literal (the concatenation route), `.constructor`/`__proto__`/`prototype` access, any call
outside the safe-method list, and host-global identifiers. Because the check is structural it cannot
be defeated by string assembly, and it also stops the denylist's over-rejection of legitimate data —
`name == 'constructor'` and a field named `window` are now valid again. The supported surface
(comparisons, logical ops, dotted/indexed access, safe methods, arrow-function array callbacks,
`typeof`) is unchanged, and `validateSyntax` continues to parse-without-executing on top of it.

**Skipped test status wired through reporting.** `MJ: Test Suite Runs` now records `SkippedTests`
and `ErrorTests` (previously left NULL); the CLI single-test and suite-markdown formatters render
Skipped as SKIP rather than FAIL and keep skips out of the Failures section; and the exported
summary aggregator counts skips separately and averages over the executed set.
