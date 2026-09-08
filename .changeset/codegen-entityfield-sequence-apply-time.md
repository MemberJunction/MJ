---
"@memberjunction/codegen-lib": patch
---

CodeGen: `EntityField` inserts carry an apply-time `Sequence` again, and the CI gate catches any literal (#4202).

#4048 (v6.1.0-edge.4) changed `getPendingEntityFieldINSERTSQL` to write the catalog ordinal as a literal, preceded by a `+100000` "park" `UPDATE` of the entity's existing rows. That is safe within one CodeGen run, where `spUpdateExistingEntityFieldsFromSchema` renumbers everything moments later, but not across two migrations replayed on a fresh database: Flyway runs every versioned migration before the repeatable renumber, so the second migration's park has nothing reliable to move and its INSERT collides on `UQ_EntityField_EntityID_Sequence`. The failure then reports itself as an unrelated FK error against `EntityFieldValue`.

- The emitter is back to the apply-time expression: `(SELECT COALESCE(MAX([Sequence]), 0) FROM [EntityField] WHERE [EntityID] = '…') + <schema-ordinal>`. Unique on any database in any order; the renumber makes the value disposable. The park is gone.
- `.github/scripts/check-migration-entityfield-sequence` is now a positional parser (`.mjs`, the `.sh` is a wrapper): it finds the `Sequence` column in the INSERT's column list and flags any bare integer in that position of every `VALUES` tuple, single- or multi-line, either quoting dialect. The previous detector only matched the six-digit `100000` band, so the ordinal form passed it.
- The gate now actually runs: it was never wired into a workflow. The "Check migrations" workflow runs its self-test on every PR and the scan, blocking, on every PR that touches `migrations/`.
