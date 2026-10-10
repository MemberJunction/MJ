---
"@memberjunction/open-app-engine": patch
---

Report which Open App migration failed and why, instead of a bare `Transaction has been aborted.`
(#3975 item 3). `RunAppMigrations` now returns Skyway's own message for the failing migration,
prefixed with its file name, plus the first database error that mssql otherwise hides behind
`See previous errors.`:

```
Migration failed for schema '__mj_ReproApp' in V202601020000__Bad_FK.sql: Failed at batch 1/1 (lines 1-8): Could not create constraint or index. See previous errors. [first database error: Foreign key 'FK_WidgetLine_Product' references invalid table '__mj_NoSuchApp.Product'.]
```

In `per-migration` mode (the `mj app install` default), Skyway's rollback of the failed transaction
throws and `Migrate()` returns an empty `Details`, so the failure is captured from its
`OnMigrationEnd` callback. The hand-written copies of Skyway's types are replaced by `import type`.
Failure path only; success behaviour is unchanged.
