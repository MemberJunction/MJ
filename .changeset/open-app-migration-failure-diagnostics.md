---
"@memberjunction/open-app-engine": patch
---

Report WHICH Open App migration failed and WHY, instead of a bare `Transaction has been aborted.`

`RunAppMigrations` surfaced only Skyway's run-level `ErrorMessage`, so a real migration failure
reached the caller as the whole of:

```
Migration failed for schema '__mj_BizAppsContracts': Transaction has been aborted.
```

No filename, no SQL error, no object name. The actual cause had to be found by extracting the
baseline and running it by hand — `Msg 1767: Foreign key 'FK_ContractLine_Product' references
invalid table '__mj_BizAppsOrders.Product'.`

Every one of those facts was already present on the failing `Details[]` entry Skyway returns: it
attaches the script name, the failed batch's number and line range, how many batches committed
first, and the driver error as `cause`. This module's minimal structural typing of the Skyway
result omitted the per-migration `Error` field entirely, so all of it was discarded. The same
message is now built for a failure Skyway *throws* (a `MigrationExecutionError` carries the same
detail) rather than flattening it to `error.message`.

The message above now reads:

```
Migration failed for schema '__mj_BizAppsContracts' in B202608040001__v0.1.x__Baseline.sql,
at batch 2 of 253, lines 50-71, 1 batch(es) succeeded first: Migration execution failed
— caused by: Foreign key 'FK_ContractLine_Product' references invalid table '__mj_BizAppsOrders.Product'.
```

Degrades in steps rather than all at once: no batch detail still names the script, no failing
detail falls back to the run-level message, and neither says so explicitly instead of emitting
`undefined`. The new `DescribeMigrationFailure` export is pure, so it is covered without a
database.

Addresses item 3 of #3975. Behaviour on success is unchanged; this touches the failure path only.
