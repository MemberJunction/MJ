---
"@memberjunction/open-app-engine": patch
---

Report WHICH Open App migration failed and WHY, instead of a bare `Transaction has been aborted.`

`RunAppMigrations` reached the caller with the whole of:

```
Migration failed for schema '__mj_BizAppsContracts': Transaction has been aborted.
```

No filename, no SQL error, no object name — the cause had to be found by extracting the baseline and
running it by hand. Two separate losses produced that, and both are fixed:

- **The per-migration `Error` was discarded.** Skyway puts the script, the failed batch and its line
  range, and the driver error on each failing result; this module's hand-written copy of skyway's
  types omitted that field. The hand-written copy is gone — the types now come from
  `@memberjunction/skyway-core` via `import type`, which adds no runtime dependency and cannot drift.
- **Skyway's own rollback threw the result away.** In `per-migration` mode — the default for both
  `mj app install` and `mj migrate` — a batch-aborting error dooms the transaction, skyway's rollback
  then throws `Transaction has been aborted.`, and `Migrate()` returns an empty `Details`. The failing
  result is captured from skyway's `OnMigrationEnd` callback, which fires before the rollback.

`mssql` also reports only the LAST error of a chain (`See previous errors.`), so the first one — the
one that names the invalid table — is recovered from `precedingErrors`. The message is now multi-line,
with the schema and file on line one:

```
Migration failed for schema '__mj_ReproApp' in V202601020000__Bad_FK.sql
  at batch 1 of 1, lines 1-8 (0 batch(es) succeeded first)
  error: Could not create constraint or index. See previous errors.
  first database error: Foreign key 'FK_WidgetLine_Product' references invalid table '__mj_NoSuchApp.Product'.
  run ended with: Transaction has been aborted.
```

Verified live against SQL Server + skyway-core 0.6.2 in both transaction modes. Failure path only;
success behaviour is unchanged. Addresses item 3 of #3975.
