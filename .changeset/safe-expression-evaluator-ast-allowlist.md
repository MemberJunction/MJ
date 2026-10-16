---
"@memberjunction/global": patch
---

Harden `SafeExpressionEvaluator` against a sandbox escape (hand-port of the evaluator fix from #3542).

**`SafeExpressionEvaluator` sandbox escape closed.** The previous defense was a textual denylist,
which a split-token expression walked straight through:
`[]["cons"+"tructor"]["cons"+"tructor"]("return process.pid")()` spells none of the banned words yet
climbs `[].constructor.constructor` to the `Function` constructor and reaches `process` — a
confirmed arbitrary-code route from any metadata-authored expression (field rules, flow/loop agent
conditions). Validation is now a **structural AST allowlist**: the expression is parsed and every
node checked before compilation, rejecting computed member access whose key is not a literal (the
concatenation route), `.constructor`/`__proto__`/`prototype` access, any call outside the
safe-method and safe-global lists, and host-global identifiers. Because the check is structural it
cannot be defeated by string assembly, and it also stops the denylist's over-rejection of legitimate
data — `name == 'constructor'` and a field named `window` are now valid again.

**The expression grammar NARROWED, and callers should read this list.** The old denylist enforced
almost nothing, so the accepted surface was in practice "whatever `new Function` compiles". The
structural allowlist accepts what the evaluator's contract always documented — comparisons, logical
ops, dotted/indexed access, the `SAFE_METHODS` list, arrow-function array callbacks, `typeof` — plus
optional chaining (`payload?.customer?.tier`) and the safe globals below. **Now refused**, where the
denylist let them through: `in` / `instanceof`, regex literals (`/x/.test(y)`), and string/array
methods outside `SAFE_METHODS` (`.split()`, `.replace()`, `.slice()`, `.substring()`, `.match()`,
`.join()`). No metadata shipped in this repo uses any of them; installations authoring their own
expressions (field rules, flow/loop agent conditions) should audit the columns that store them
before upgrading.

**Ambient globals stay callable.** `SAFE_EXPRESSION_GLOBALS` (newly exported) — `Math`, `Number`,
`String`, `Boolean`, `Array`, `Object`, `JSON`, `Date`, `parseInt`, `parseFloat`, `isNaN`,
`isFinite` — may be called as namespace methods (`Math.abs(...)`, `Object.keys(...)`,
`JSON.stringify(...)`, `Array.isArray(...)`, `Date.now()`) or as bare functions (`Number(...)`,
`parseInt(...)`, `isNaN(...)`).
