---
'@memberjunction/codegen-lib': patch
---

CodeGen can prune entity metadata on PostgreSQL again

`PostgreSQLCodeGenProvider.callRoutineSQL` invoked every routine as `SELECT * FROM routine(...)`.
PostgreSQL rejects that form outright for a function declared `RETURNS SETOF record` —
`spDeleteEntityWithCoreDependencies` is one — with "a column definition list is required for
functions returning record", and a routine that only performs work has no column list to supply.

The entity-pruning pass therefore threw once per entity, logged `Error removing metadata for entity
undefined`, and carried on. CodeGen exited non-zero having pruned nothing, so orphaned `EntityField`
rows survived; the engine then built base-view SELECTs for columns the regenerated views no longer
had (`column "EntityAction" does not exist`), which broke `mj sync push` and the next CodeGen run.
Nothing in that chain pointed back at the call shape.

`callRoutineSQL` now takes `discardResult`, and emits `DO $$ BEGIN PERFORM routine(...); END $$` when
set — PERFORM runs the function and discards whatever it returns. Passed at the one call site whose
rows are never read. SQL Server's `EXEC` is unaffected and ignores the flag.
