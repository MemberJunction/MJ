---
"@memberjunction/server": patch
"@memberjunction/schema-engine": patch
---

An apply that produces no tables now fails instead of running RSU on nothing.

`buildTargetConfigs` already drops a selected object that is not in the source schema, has no fields or has no primary key, and logs each drop — but `IntegrationApplySchema`, `IntegrationStartSync`/`ApplyAll` (`buildSchemaForConnector`) and `IntegrationSchemaEvolution` then built and ran a migration anyway. With nothing accepted that migration was a header-only file, and every step after it was green: RSU wrote the file, opened and merged the PR, ran CodeGen, Explorer redeployed, and the sync "completed" over zero entity maps. Seen 2026-10-29 on a PropFuel connection — three selections requested, three dropped as `notInSchema`, three empty `RSU_` migrations committed, no entities.

- `@memberjunction/server`: the three execution paths call a new `assertTargetConfigs` after `buildTargetConfigs` and throw `NO_TARGET_TABLES` naming the requested objects when none produced a target table. The existing `catch` turns that into `Success: false` on the apply. `IntegrationSchemaPreview` is not gated — an empty preview is an honest answer.
- `@memberjunction/schema-engine`: `ValidateMigrationSQL` now rejects SQL with no executable statement (empty, whitespace, `--` comments, block comments or bare `GO` only), via a new exported `HasExecutableSQL`. The batch fails at `ValidateSQL`, and `Preview` reports it in `ValidationErrors`, before anything is written or committed.
  The existing test that asserted empty SQL is valid is inverted accordingly.

No change for an apply that produces at least one table, or for a migration with at least one statement.
