---
"@memberjunction/generic-database-provider": patch
"@memberjunction/server": patch
---

Security: dataset reads no longer run caller SQL or ignore the caller's permissions. The `GetDatasetByName` and `GetDatasetStatusByName` GraphQL queries now screen every `ItemFilters[].Filter` with the same AST screen as a RunView `ExtraFilter` (one statement, read-only, subqueries only over entity base views the caller can read) and pass the session user to the provider; `GetMultipleDatasetStatusByName` passes it too. With a context user, `GenericDatabaseProvider` now requires read permission on each dataset item's entity, applies the user's read row filter to the item query and its status query, and keys the item's cache slot by that filter. A client filter that fails the provider denylist refuses its item. `MJ_Metadata` stays loadable by every authenticated principal. Dataset rows returned over GraphQL get the same encrypted-field API policy as other read paths.
