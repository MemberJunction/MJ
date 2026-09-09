---
"@memberjunction/codegen-lib": patch
---

Fix `codegen --skipdb` (and any run with advanced generation off) silently deleting every generated entity validator.

`manageEntityFieldValuesAndValidatorFunctions` wrapped both of its `runValidationGeneration` call sites — the column-level branch where the regex could not parse the CHECK constraint, and the table-level loop — in an `ag.featureEnabled('ParseCheckConstraints')` gate. That gate is redundant: the same check already exists inside `generateValidatorFunctionFromCheckConstraint`, correctly paired with `generateNewCode` so that it guards only the LLM call.

Because `featureEnabled` is `this.enabled && feature?.enabled === true`, and `--no-ai` turns `enabled` off, the outer gate meant the function was never *called* — including on the path that returns the **already-saved** validator from the database when the stored `GeneratedValidationFunctionCheckConstraint` still matches the live `ConstraintDefinition`. Loading previously-generated code is not an AI operation, but the outer gate treated it as one.

The consequence: `ManageMetadataBase.generatedValidators` came back empty, `GenerateValidateFunction` emitted no `Validate()` override for any entity, and the regenerated entity subclasses dropped every validator on the floor. On this repo that was 57 `Validate()` overrides and their per-field validator methods — ~2,890 lines — removed by a command that exited 0 and reported success. `mj codegen --skipdb` is a documented workflow for metadata-only changes, and `scripts/codegen-idempotency-check.mjs` uses it to restore the working tree in its cleanup block, so the loss surfaced as an unrelated-looking drift failure.

Both outer gates are removed so `runValidationGeneration` always runs; the inner function decides what to do, and already handles every case correctly — return stored code without calling an LLM, regenerate when the constraint changed and AI is available, or report failure and emit nothing. The `ParseCheckConstraints` gate that actually prevents LLM calls under `--no-ai` is unchanged. The now-unused local `AdvancedGeneration` instance in the caller is dropped.

No behavior change when advanced generation is enabled. Validators whose source CHECK constraint changed while AI is unavailable are still not emitted — that case has no stored code to load.
