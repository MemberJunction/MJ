---
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
---

Make SQL Server save-call SQL variable suffixes a deterministic PK hash instead of a random uuid slice, so MetadataSync recaptures of an unchanged tree are byte-identical (loom #12 WP3). The suffix is the first 12 hex of sha1(`schema.table|pk`) with key values normalized (UUIDs lower-cased, Dates as ISO-8601), plus `_n` when the same hash repeats inside one TransactionGroup. The allocator lives on GenericDatabaseProvider (shared GenerateSaveSQL orchestrator); SQLServerDataProvider.RenderSaveCallBinding consumes it. `SQLServerTransactionGroup.scopeItemVariables` now scopes every name in a comma-separated DECLARE list (previously only the first), so batched submits no longer rely on per-item suffixes to keep locals distinct.
