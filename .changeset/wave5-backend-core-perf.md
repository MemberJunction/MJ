---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/templates": patch
---

Wave 5 backend and core performance optimizations:

- **Zero-readback `TrackRecordChanges` (`@memberjunction/sqlserver-dataprovider`)**: Add optional `@EntityID` and `@SuppressReturn` parameters to `[__mj].[spCreateRecordChange_Internal]` and emit `@EntityID` + `@SuppressReturn=1` inside inline save/delete batches instead of allocating `@ResultChangesTable` and joining `vwRecordChanges` for discarded rows. Also terminate `TrackRecordChanges` delete statements with `;` and harden `SQLServerTransactionGroup.ScopeItemVariables` EXEC-span boundary detection.
- **Batched `RelatedRecordCollection` request deserialization (`@memberjunction/core`)**: Preload existing child rows and pending removals in O(1) `RunView` queries per entity type (`BaseEntity.HydrateFromRow`) instead of N serial `InnerLoad` roundtrips when entities use default `InnerLoad`.
- **Contiguous leaf-node batching in `EntitySavePlan` (`@memberjunction/core`)**: Group consecutive homogeneous `CanBatchLeaf` steps inside `ExecuteEntitySavePlan` into a `TransactionGroup` with `BatchedSubmit = true`.
- **Savepoint-safe post-commit task coalescing (`@memberjunction/core`, `@memberjunction/generic-database-provider`)**: Add `ScheduleAfterCommit` (`coalesceKey`, `coalesceMode`: `'coalesce' | 'dedupe' | 'append'`) on `DatabaseProviderBase` / `GenericDatabaseProvider`, respecting transaction rollback and savepoints.
- **Pure-interpolation template fast-path (`@memberjunction/templates`)**: Compile pure `{{ a.b }}` Nunjucks templates without tags, filters, or comments directly against the sandboxed member lookup helpers (`ResolveSafeMemberLookup` / `ResolveSafeRootBinding`).
- **`UserInfo` linked entity typing (`@memberjunction/core`)**: Fix `UserInfo.LinkedEntityID` and `UserInfo.LinkedEntityRecordID` from `number` to `string`.
