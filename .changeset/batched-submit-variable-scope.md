---
"@memberjunction/sqlserver-dataprovider": minor
---

Fix batched transaction-group submit failing for any group of two or more change-tracked records — `The variable name '@ResultChangesTable' has already been declared. Variable names must be unique within a query batch or stored procedure.`

`executeBatchedNoVars` collapses a group into one multi-statement batch. T-SQL scopes `DECLARE` to the **batch** — `BEGIN…END` creates no declaration scope — so each generated CRUD wrapper's `@ResultTable`, `@ID` and (for entities that track record changes) `@ResultChangesTable` were declared once per item, and SQL Server rejected the whole batch. Since almost every entity tracks record changes, this fired for essentially every group large enough to be worth batching.

The sequential path was never affected because it sends each item as its own request; its own comment says it executes items individually "to avoid variable conflicts between different stored procedure calls that might use same variable names". Batching gave up that isolation without restoring it.

Each item's declared locals are now renamed to `@<name>_mjb<index>` before the batch is joined. Two details the rename has to get right:

- **String literals and comments are masked** before scanning, so `'the value of @ID is unknown'` is left alone.
- **A callee's parameter name is not a local.** `spCreateActionCategory` takes a parameter named `@ID` while the wrapper also declares a local `@ID`; renaming the argument name yields `@ID_mjb2 is not a parameter for procedure spCreateActionCategory`. Position distinguishes them, and "followed by `=`" is not sufficient — `SELECT @ID = …` is an assignment to the local and must be renamed — so only `EXEC` argument lists are protected.

Behavioural impact was not theoretical: `IntegrationEngine` sets `BatchedSubmit = true` for its sync write batches, so integration syncs writing two or more tracked records failed and rolled back.

The `transaction-groups-batched` integration bundle catches this, but it is mutation-gated and `integration.yml` does not set `RUN_MUTATION_TESTS=1`, so the bundle had never executed in CI.
