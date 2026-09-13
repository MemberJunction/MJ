---
"@memberjunction/codegen-lib": patch
---

CodeGen no longer deletes committed `Validate()` overrides when it runs without AI.

`ManageMetadataBase.generatedValidators` — the list `GenerateValidateFunction` reads to emit each entity's `Validate()` override — was populated in only one of `runCodeGen`'s two branches. On the skip-database path `loadGeneratedCode` read the persisted `GeneratedCode` records; on the database-generation path the sole source was `runValidationGeneration`, which requires AI. File generation runs on both paths, so a full `mj codegen --no-ai` emitted the entity subclasses as though no validators existed and removed every committed override — not "declined to add new ones", deleted the existing ones.

That is how v6.1.0-edge.5's 56 overrides disappeared in `197fdf8376`, a full regeneration whose commit message and changeset mention validation nowhere. The `codegen-drift` CI gate then held the loss in place, because it runs `codegen --no-ai` and requires the committed artifacts to match that output.

Persisted validators are now loaded on every path, before file generation. Safe on the AI path too: `GenerateValidateFunction` already deduplicates by `functionName` over a deterministic sort, so a validator both freshly generated and read back from `GeneratedCode` yields one emission rather than two.
