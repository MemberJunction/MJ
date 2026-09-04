---
"@memberjunction/sqlglot-ts": patch
"@memberjunction/cli": patch
---

Seed the BIT/BOOLEAN registry from the live catalog when baking PostgreSQL migrations. The registry was collected only from the migration set's own baseline, which declares the app's tables and never MJ core's — so an Open App migration seeding `__mj.EntityField` had no type information for `AllowsNull` / `IsVirtual` / `IsPrimaryKey`, emitted bare `0`/`1`, and failed with `column "AllowsNull" is of type boolean but expression is of type integer`, halting the whole bake chain. `--bake-codegen` already requires a live connection, so `information_schema` is now read for the core and app schemas and merged in via the new `MJPostgresTranspiler.addExtraBitColumns()`. Also corrects the registry's type: entries are `[table, column]` pairs (`BitColumnRef`), not the `string[]` the signature claimed — a `"Table.Column"` string would have serialized fine and matched nothing.
