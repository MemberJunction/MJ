---
"@memberjunction/server": patch
"@memberjunction/data-context-server": patch
"@memberjunction/core-entities-server": patch
---

Data Context Items of type `sql` no longer run caller-written SQL unchecked (security C7).

- **`GetDataContextData` / `GetDataContextItemData`.** A data context's SQL items now run only for its owner or an administrator (Owner-type user), never for a scope-limited (magic-link) session, and only on the read-only provider. The read-write pool is never used for them. With no read-only database configured, SQL items are refused, and items of the other types still load. Before it runs, the SQL must pass the checks `ExecuteAdhocQuery` applies: a single read statement (`RenderPipeline` with `RequireReadStatement`) whose every table is an entity base view the caller may read in full. Both queries now reject an ID that is not a UUID, and items of the other types load for the calling user.
- **`DataContextItemServer.LoadFromSQL`** runs the item's SQL through the data source's `RunQuery({ SQL })` ad-hoc path for the context user. It refuses a raw connection pool, a missing context user, and an item with no SQL. `mssql` is no longer used.
- **`MJ: Data Context Items`.** A new server entity class, `MJDataContextItemEntityServer`, lets only an Owner-type user create a SQL item, change an item's SQL or type to SQL, or move a SQL item to another data context.

Upgrade note: deployments without a read-only database login (`dbReadOnlyUsername` / `dbReadOnlyPassword`) can no longer run SQL data context items. Existing SQL items are refused when a non-owner loads them, when their SQL is not a single read over entity base views, or when the ad-hoc path's keyword check refuses it (for example a `REPLACE(` call, which `ExecuteAdhocQuery` already refuses).
