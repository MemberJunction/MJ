---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/sqlserver-dataprovider": minor
"@memberjunction/postgresql-dataprovider": minor
"@memberjunction/integration-engine": minor
"@memberjunction/record-graph": minor
"@memberjunction/ai-vector-dupe": minor
"@memberjunction/ai-vector-sync": minor
---

Implement the MJ Peer Sync (`MemberJunctionConnector`) core and in-process pipeline (#6021 / #6502), including the `RecordChange` T-SQL migration (`CHK_RecordChange_Source` `'Sync'`, `spCreateRecordChange_Internal` `@IntegrationID`, and `IX_RecordChange_EntityID_ChangedAt`), server-only `BaseEntity.SetSyncContext` (`RecordChange.Source = 'Sync'`, `Integration.ID` FK binding, and `IRecordChangeSyncContext` provenance with optional `OriginUserEmail` for service accounts across `MJCore` and SQL Server / PostgreSQL data providers), Tarjan SCC + two-pass nullable FK cycle planning in `@memberjunction/record-graph`, per-record `EntityVectorSyncer.VectorizeRecords` and batch `DuplicateRecordDetector.FindCandidatesForValues`, `ComputeThreeWayFieldMerge` and the `BaseIntegrationConnector.RunPipeline` seam (plus incremental push `'MJ: Record Changes'` and `EntityID` record-map lookup fixes), and the `SchemaPlanner`, `ChangeSetPlanner`, `PeerIdentityGate`, `PeerSyncApplier`, `PeerSyncEndpointService` (`InProcessPeerSyncTransport` + per-run `FlushDeferredForeignKeys`), `PeerSyncDoorbell`, and `MemberJunctionConnector` modules.
