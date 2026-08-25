---
"@memberjunction/global": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/task-graph": patch
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
outside the safe-method and safe-global lists, and host-global identifiers. Because the check is structural it cannot
be defeated by string assembly, and it also stops the denylist's over-rejection of legitimate data —
`name == 'constructor'` and a field named `window` are now valid again. `validateSyntax` continues to
parse-without-executing on top of it.

**The expression grammar NARROWED, and callers should read this list.** The old denylist enforced
almost nothing, so the accepted surface was in practice "whatever `new Function` compiles". The
structural allowlist accepts what the evaluator's contract always documented — comparisons, logical
ops, dotted/indexed access, the `SAFE_METHODS` list, arrow-function array callbacks, `typeof` — plus
optional chaining (`payload?.customer?.tier`) and the safe globals below. **Now refused**, where the
denylist let them through: `in` / `instanceof`, regex literals (`/x/.test(y)`), and string/array
methods outside `SAFE_METHODS` (`.split()`, `.replace()`, `.slice()`, `.substring()`, `.match()`,
`.join()`). No metadata shipped in this repo uses any of them; installations authoring their own
expressions (field rules, flow/loop agent conditions, task-graph conditions) should audit the columns
that store them before upgrading.

**Ambient globals stay callable, and the list now has ONE owner.** `SAFE_EXPRESSION_GLOBALS` in
`@memberjunction/global` — `Math`, `Number`, `String`, `Boolean`, `Array`, `Object`, `JSON`, `Date`,
`parseInt`, `parseFloat`, `isNaN`, `isFinite` — may be called as namespace methods (`Math.abs(...)`,
`Object.keys(...)`, `JSON.stringify(...)`, `Array.isArray(...)`, `Date.now()`) or as bare functions
(`Number(...)`, `parseInt(...)`, `isNaN(...)`). Receiver and method are both fixed identifiers, so
none of the four invariants that close the escape is weakened. `ai-core-plus`'s task-graph door now
imports that set instead of keeping its own copy: `1efc248ac5` shipped the decision that the door
must not refuse `Number(payload.count) > 3` or `Math.abs(output.delta) < 5`, and a second curated
list is how the two halves came apart. `RESOLVABLE_GLOBALS` is removed from
`@memberjunction/ai-core-plus`; import `SAFE_EXPRESSION_GLOBALS` from `@memberjunction/global`. The
pinning test now CALLS every entry — it previously only read each name (`Math !== undefined`), which
is why a screen that refused `Math.abs(x)` passed it.

**A policy refusal now HOLDS a task-graph edge instead of rerouting it.** `IsBrokenGuard` recognises
the evaluator's refusal message, so a stored graph carrying a construct this build no longer accepts
stalls visibly rather than taking a different path with no recorded cause — the dispatcher logs a
reason only on `hold`.

**Skipped test status wired through reporting.** `MJ: Test Suite Runs` now records `SkippedTests`
and `ErrorTests` (previously left NULL); the CLI single-test and suite-markdown formatters render
Skipped as SKIP rather than FAIL and keep skips out of the Failures section; and the exported
summary aggregator counts skips separately and averages over the executed set.
