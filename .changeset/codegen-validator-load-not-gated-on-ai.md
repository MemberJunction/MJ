---
"@memberjunction/codegen-lib": patch
---

CodeGen: reading persisted validators is a database read, not an AI call — stop gating it on the AI feature flag.

`mj codegen --no-ai` emitted every entity subclass as though it had no `Validate()` override, silently
DELETING the ones already committed. `loadGeneratedCode` reached
`manageEntityFieldValuesAndValidatorFunctions`, but both call sites that queue a validator sat behind
`ag.featureEnabled('ParseCheckConstraints')` — and `--no-ai` sets `enableAdvancedGeneration = false`, so
that predicate is false. The method still returned `true` and the spinner still reported success, having
loaded nothing.

The read never needed AI: it is called with `generateNewCode = false`, and
`generateValidatorFunctionFromCheckConstraint` only reaches an LLM when that flag is true. The load pass
is now unconditional; generation stays gated exactly as before.

This is the second half of the `v6.1.0-edge.5` regression. The first half (loading only on the `--skipdb`
branch) was fixed separately; with the load reachable but inert under `--no-ai`, a full run still dropped
all 56 overrides — and the `codegen-drift` gate, which runs `--no-ai`, required that lossy output, so
restoring the validators failed CI while deleting them passed.

Also: the success line now reports how many validators were loaded, so a zero-load run is visible in CI
output rather than indistinguishable from a healthy one.
