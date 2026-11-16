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

Implement the MJ Peer Sync (`MemberJunctionConnector`) Phase 0–4 pipeline (#6021), including server-only `BaseEntity.SetSyncContext` (`RecordChange.Source = 'Sync'`, `IntegrationID`, and `IRecordChangeSyncContext` provenance across `MJCore` and SQL Server / PostgreSQL data providers), Tarjan SCC + two-pass nullable FK cycle planning in `@memberjunction/record-graph`, per-record `EntityVectorSyncer.VectorizeRecords` and batch `DuplicateRecordDetector.FindCandidatesForValues`, `ComputeThreeWayFieldMerge` and the `BaseIntegrationConnector.RunPipeline` seam (plus incremental push `'MJ: Record Changes'` and `EntityID` record-map lookup fixes), and the `SchemaPlanner`, `ChangeSetPlanner`, `PeerIdentityGate`, `PeerSyncApplier`, `PeerSyncEndpointService`, `PeerSyncDoorbell`, and `MemberJunctionConnector` modules.
