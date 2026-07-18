---
"@memberjunction/integration-engine": minor
"@memberjunction/schema-engine": minor
"@memberjunction/server": minor
"@memberjunction/integration-schema-builder": minor
"@memberjunction/scheduling-engine": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/postgresql-dataprovider": patch
---

Align the integrations framework with the RSU specification (rsuplan.md) — resolution overlay, EM/EFM lifecycle, sync locking, watermark backfill, and the U1–U5/U7/U10/U11 upstream defects.

**Engine (`integration-engine`)**
- U1: `IntrospectSchema`/creation-pipeline mappings propagate `undefined` PK/FK flags instead of coercing to `false` — a sample's silence can no longer wipe a declared primary key (`SourceFieldInfo.IsPrimaryKey/IsForeignKey` widened to optional).
- RSU-spec semantic overlay (`decideSemanticOverlay`): Description / DisplayName / IncrementalWatermarkField are external-wins-when-present, curated-fallback-when-silent (per-attribute war of attrition).
- RSU-spec hash basis: the content-hash match/write covers MAPPED fields only — a newly-appearing custom key no longer forces a row rewrite. Custom-key candidates + sizing statistics are aggregated in-memory per sync (`SyncResult.CustomKeyStats`, `foldCustomKeyStats`, `inferColumnTypeFromStats`) and flow to the promotion callback regardless of row skips. One-time note: rows whose stored hash included overflow re-write once and converge.
- Maintenance lock (`AcquireMaintenanceLock`/`ReleaseMaintenanceLock`/`GetMaintenanceLock`): syncs refuse while a metadata refresh / schema evolution / RSU pipeline runs for the connection.
- U3: live sync progress is monotonic under concurrency (`RatchetProgressSnapshot`).
- U11: `IntrospectSchemaOptions.OnProgress` — determinate discovery progress (scanned/total).

**Server (`server`)**
- `IntegrationSchemaEvolution` is now the full RSU-spec refresh: re-resolution → diff → removed objects' entity/field maps disabled (data kept) → changed objects' field maps reconciled + Pull watermarks reset (U10, backfills new columns) → new objects' tables created with entity maps born DISABLED (`autoEnableNewObjects` opts in) → RSU. Extended output: NewObjects/RemovedObjects/ChangedObjects/WatermarksReset.
- `IntegrationApplyAll`/`ApplyAllBatch`: `UnselectedAction` ('disable' default) — objects absent from the selection get their entity + field maps disabled; re-selection re-enables both. First-ever apply defaults to a FULL sync.
- U7: schedule creation is unique per (connection, job kind) — update-in-place instead of duplicates.
- U5: boot-time assert when RSU's additionalSchemaInfo write path diverges from CodeGen's read path.
- RSU-spec multi-credential-type: new `IntegrationCredentialType` junction (migration) + connection-create validation against the allowed set (junction ∪ legacy column).
- DAG exposure: `IntegrationListSourceObjects` items carry `DependsOn` parent names.
- U11: RSU status/progress expose CurrentStepName/StepIndex/StepTotal; pipeline steps carry StepIndex/StepTotal.

**SchemaEngine / schema-builder**
- additionalSchemaInfo per-table REPLACE semantics for soft FKs (`ClearForeignKeysForTables`) — a refresh's resolution replaces the prior run's FK entries for its tables.
- `RSUPendingWork`: `UnselectedAction` + `CreateDisabled` for the post-restart consumer; U11 step-index fields.

**CodeGenLib / PostgreSQLDataProvider**
- U2: `spUpdateExistingEntityFieldsFromSchema` honors `IsSoftPrimaryKey` on BOTH dialects (PG emitter + SQL Server migration) — schema sync no longer wipes resolved soft PKs.
- U4: a keyless entity now throws a named "has no primary key" error instead of emitting malformed record-change SQL.
