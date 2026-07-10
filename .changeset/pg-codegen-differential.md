---
"@memberjunction/codegen-lib": minor
---

Fix two PostgreSQL CodeGen bugs that turned every `mj codegen` run into a full ~380-entity regeneration instead of a differential (emitting ~184k lines of byte-identical views/sprocs each run):

1. **Base-view false "changed" detection.** `checkBaseViewChangedInDB` compared the generated view text against PostgreSQL's `pg_get_viewdef()`, which re-qualifies columns and normalizes whitespace/casing — so it never byte-matched and reported ~314/380 base views as "changed." On PostgreSQL it now relies on the metadata-driven modified-entity list (genuine column changes are still caught); SQL Server keeps the verbatim-definition comparison.

2. **Sequence-renumber over-regeneration.** `spUpdateExistingEntityFieldsFromSchema` flagged an entity as modified for a pure `Sequence` renumber (a freshly-added field's temp `100037` → `19`), forcing a byte-identical view+sproc regen for dozens of entities. The renumber is still applied, but a Sequence-only change no longer marks the entity for regeneration.

Net: a fresh-migrated PG database now regenerates only genuinely-changed entities.
