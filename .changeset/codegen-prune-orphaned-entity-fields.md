---
'@memberjunction/codegen-lib': patch
---

CodeGen prunes the EntityField rows its own base-view regeneration orphans

Step 2 of the SQL pass regenerates the base view of every included entity, so a view can lose columns without the entity's table changing — the 6.1 hierarchy opt-in gate (#3939) does exactly that, dropping `Root*`/`Depth`/`Path`/`IsLeaf`/`ChildCount` from any view whose self-referencing FK is not opted in. The virtual `EntityField` rows for those columns survived, so the declared field count stopped matching the base view and every save on the entity failed with Msg 213.

CodeGen could not recover from the state it had just created. The prune is deferred by Pass 1, and Pass 2 scoped it to `newEntityList ∪ modifiedEntityList` — two lists populated only from table-schema changes, so a view-only shrink flags nothing and an empty filter fast-exited Pass 2 outright. The affected entity was therefore never scanned, on that run or any later one; only an unrelated `mj migrate` healed it, through `R__RefreshMetadata`'s unscoped call to the same stored procedure.

`manageEntityFields` now runs the prune before the empty-filter fast-exit and runs it unscoped, and folds any entity it pruned into that pass's scope so `spUpdateExistingEntityFieldsFromSchema` re-aligns the surviving fields' `Sequence` in the same run. The prune is one SP call — the same scan `R__RefreshMetadata` already performs on every migrate — and the scoping optimization is untouched for the per-entity steps it was measured on. Pass 1 still defers the prune.

Fixes #4050.
