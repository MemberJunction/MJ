---
"@memberjunction/server": patch
"@memberjunction/data-context-server": patch
"@memberjunction/core-entities-server": patch
---

Data Context Items of type `sql` no longer run caller-written SQL unchecked (security C7).

- **`GetDataContextData` / `GetDataContextItemData`.** A data context's SQL items now run only for its owner or an administrator (Owner-type user), never for a scope-limited (magic-link) session, and only on the read-only provider. The read-write pool is never used for them. Before it runs, each item's SQL must pass the checks `ExecuteAdhocQuery` applies: a single read statement (`RenderPipeline` with `RequireReadStatement`) whose every table is an entity base view the caller may read in full. Both queries reject an ID that is not a UUID, and items now load for the calling user.
- **Per-item results.** A SQL item that may not run is refused on its own. `GetDataContextData` still loads the other items and returns one entry per item, in item order, in `Results` (the data, or null) and `ErrorMessages` (null, or the reason). `Success` is true, and `ErrorMessages` null, only when every item loaded, so a client that treats `Success: false` as an error still sees one.
- **`DataContextItemServer.LoadFromSQL`** runs the item's SQL through the data source's `RunQuery({ SQL })` ad-hoc path for the context user. It refuses a raw connection pool, a missing context user, and an item with no SQL. `mssql` is no longer used.
- **`MJ: Data Context Items`.** A new server entity class, `MJDataContextItemEntityServer`, lets only an Owner-type user save an item that is a SQL item or holds SQL text: create it, change any of its fields, or move it. It reads the item's values, not which fields changed, and refuses a non-Owner's save of an existing item whose `Type` or `SQL` was not loaded. It applies the same rule to `ReplayOnly` saves, which skip `Validate()`.
- **`UpdateMJDataContextItem` always loads the stored row.** `ResolverBase.MustLoadTruthFromDatabase` now includes `MJ: Data Context Items`, as it already includes `MJ: Record Changes`. Client-supplied `OldValues___` can no longer decide the item's starting state, so a client cannot hide a SQL item by repeating its new values as old ones or by leaving `Type` and `SQL` out.

Upgrade note:
- Deployments without a read-only database login (`dbReadOnlyUsername` / `dbReadOnlyPassword`) can no longer run SQL data context items. The other items of a data context still load.
- Existing SQL items are refused when a non-owner loads them, when their SQL is not a single read over entity base views, or when the ad-hoc path's keyword check refuses it (for example a `REPLACE(` call, which `ExecuteAdhocQuery` already refuses). `GetDataContextItemData` also no longer returns a refused SQL item's cached data.
- Users who are not Owner-type can no longer edit any field of a SQL item, including its cached data. They can still delete it, or turn it into another type by removing its SQL.
