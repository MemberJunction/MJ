---
"@memberjunction/codegen-lib": minor
---

Fix two PostgreSQL CodeGen bugs that turned every `mj codegen` run into a full ~380-entity regeneration instead of a differential (emitting ~184k lines of byte-identical views/sprocs each run):

1. **Base-view false "changed" detection.** `checkBaseViewChangedInDB` compared the generated view text against PostgreSQL's `pg_get_viewdef()`, which re-qualifies columns and normalizes whitespace/casing — so it never byte-matched and reported ~314/380 base views as "changed." On PostgreSQL this now compares the view's exposed **column set** (`information_schema.columns`) against the entity's expected fields instead of text: deterministic, immune to `pg_get_viewdef` reformatting, and it still catches a stale view whose columns drifted from metadata (the v5.46 OpenApp outage — a migration adds a column + metadata but doesn't re-bake the view) plus the missing-view self-heal (empty column set → force-recreate). SQL Server keeps its verbatim-definition text comparison.

2. **Sequence-renumber over-regeneration.** `spUpdateExistingEntityFieldsFromSchema` flagged an entity as modified for a pure `Sequence` renumber (a freshly-added field's temp `100037` → `19`), forcing a byte-identical view+sproc regen for dozens of entities. The renumber is still applied, but a Sequence-only change no longer marks the entity for regeneration.

Net: a fresh-migrated PG database regenerates only genuinely-changed entities, and a stale view (columns not matching metadata) is still healed.
