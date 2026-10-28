# @memberjunction/integration-actions

MemberJunction Integration Engine Actions — MJ Actions for triggering and managing integration syncs, staging database bootstrap from SQL Server backups, and Azure Blob backup inspection.

## Installation

This package is registered as a workspace package. Add it as a dependency and import it so the `@RegisterClass` decorators fire:

```typescript
// In your bootstrap or entry point:
import '@memberjunction/integration-actions';
```

## Actions

### 1. Run Integration Sync

**Action Name**: `Run Integration Sync`

Triggers a sync run for a `MJ: Company Integration` record, pulling or pushing records according to entity maps, field maps, and sync watermarks.

| Parameter | Direction | Type | Required | Description |
|-----------|-----------|------|----------|-------------|
| `CompanyIntegrationID` | Input | string | Yes | ID of the CompanyIntegration to sync |
| `TriggerType` | Input | string | No | `Manual`, `Scheduled`, or `Webhook` (default: `Manual`) |
| `FullSync` | Input | string | No | Set to `'true'` to force a full sync ignoring watermarks |
| `EntityMapIDs` | Input | string | No | Comma-separated list of EntityMapIDs to restrict the sync |
| `RecordsProcessed` | Output | number | — | Total records processed |
| `RecordsCreated` | Output | number | — | Records created in MJ |
| `RecordsUpdated` | Output | number | — | Records updated in MJ |
| `RecordsDeleted` | Output | number | — | Records deleted in MJ |
| `RecordsErrored` | Output | number | — | Records that encountered errors |
| `RecordsSkipped` | Output | number | — | Records that were skipped |
| `ErrorSummary` | Output | string | — | JSON array of first 10 errors (only when errors exist) |

**Result Codes**:
- `SUCCESS` — Sync completed without errors
- `SYNC_COMPLETED_WITH_ERRORS` — Sync completed but some records failed
- `MISSING_PARAMETER` — Required `CompanyIntegrationID` not provided
- `UNEXPECTED_ERROR` — Unhandled exception during sync

---

### 2. Bootstrap SQL Server Integration From Backup

**Action Name**: `Bootstrap SQL Server Integration From Backup`

Performs a high-speed initial bootstrap of external SQL Server tables into MemberJunction target tables using a staged Azure Blob or local disk backup restore and in-engine minimally-logged ETL.

| Parameter | Direction | Type | Required | Description |
|-----------|-----------|------|----------|-------------|
| `CompanyIntegrationID` | Input | string | Yes | ID of the Company Integration being bootstrapped |
| `BackupUrls` | Input | string | Yes | Single Azure Blob URL / disk path or comma-separated list of URLs/paths for striped backups |
| `SasToken` | Input | string | No | Shared Access Signature token for Azure Blob container access (redacted from logs) |
| `StorageCredentialID` | Input | string | No | MJ Credentials record ID storing the SAS token |
| `StagingDatabaseName` | Both | string | No | Temporary staging database name (default: auto-generated); returned with the name actually used |
| `DropStagingDbOnComplete`| Input | string | No | `'true'` or `'false'` (default: `'true'`) to drop staging DB on completion |
| `TruncateTargetBeforeLoad`| Input | string | No | `'true'` or `'false'` (default: `'false'`) to truncate target tables before load for safe re-runs |
| `BatchSize` | Input | number | No | Chunk batch size for large table transfers (default: 500,000; 0 for unchunked) |
| `TargetDataFileDirectory` | Input | string | No | Custom directory for staging database .mdf file |
| `TargetLogFileDirectory` | Input | string | No | Custom directory for staging database .ldf file |
| `EntityMapIDs` | Input | string | No | Comma-separated list of specific EntityMapIDs to restrict bootstrap |
| `ProgressRunID` | Input | string | No | Integration progress run to report stages to. Set by the `IntegrationStartBootstrap` GraphQL mutation, which launches this action detached and returns the run ID; clients tail the run with `IntegrationTailRunEvents` instead of awaiting the action |
| `BackupStartDate` | Output | string | — | Point-in-time timestamp (ISO UTC) when backup began (seeds watermarks) |
| `TablesProcessed` | Output | number | — | Count of entity tables transferred |
| `TotalRowsTransferred` | Output | number | — | Total record count inserted into target tables |
| `DurationSeconds` | Output | number | — | Total runtime in seconds |
| `StagingDatabaseDropped`| Output | number | — | 1 if staging DB was dropped, 0 if retained |

**Result Codes**:
- `SUCCESS` — Backup restored, ETL completed, record maps seeded, and watermarks set
- `MISSING_PARAMETER` — Required parameters missing
- `INVALID_PARAMETER` — Invalid backup URL or parameter values
- `BOOTSTRAP_FAILED` — Error during restore, validation, ETL transfer, or cleanup

---

### 3. List Azure Backup Blobs

**Action Name**: `List Azure Backup Blobs`

Queries an Azure Blob Storage container via the Azure REST API to discover available `.bak` files for bootstrap integration.

| Parameter | Direction | Type | Required | Description |
|-----------|-----------|------|----------|-------------|
| `ContainerUrl` | Input | string | Yes | Azure Blob Storage container URL |
| `SasToken` | Input | string | No | Shared Access Signature token for container access (redacted from logs) |
| `StorageCredentialID` | Input | string | No | MJ Credentials record ID storing the SAS token |
| `Prefix` | Input | string | No | Optional prefix to filter blob names (e.g. `AdventureWorks_`) |
| `Blobs` | Output | string | — | JSON-serialized array of `{ Name, Url, SizeBytes, LastModified }` |
| `BlobCount` | Output | number | — | Total number of blobs found |

**Result Codes**:
- `SUCCESS` — Blobs listed successfully
- `MISSING_PARAMETER` — `ContainerUrl` not provided
- `INVALID_PARAMETER` — `ContainerUrl` is not a valid URL
- `LIST_BLOBS_FAILED` — Azure Storage REST API error or network failure

---

### 4. Inspect SQL Server Backup

**Action Name**: `Inspect SQL Server Backup`

Inspects SQL Server backup files (.bak) from Azure Blob Storage or local disk by executing `RESTORE HEADERONLY` and `RESTORE FILELISTONLY` across all media stripes.

| Parameter | Direction | Type | Required | Description |
|-----------|-----------|------|----------|-------------|
| `CompanyIntegrationID` | Input | string | No | ID of the Company Integration being inspected |
| `BackupUrls` | Input | string | Yes | Single backup URL/path or comma-separated list of URLs/paths for striped sets |
| `SasToken` | Input | string | No | Shared Access Signature token for Azure Blob container access (redacted from logs) |
| `StorageCredentialID` | Input | string | No | MJ Credentials record ID storing the SAS token |
| `BackupStartDate` | Output | string | — | ISO UTC timestamp when backup was initiated |
| `DatabaseName` | Output | string | — | Original database name from backup header |
| `BackupSizeBytes` | Output | number | — | Total size of the backup in bytes |
| `Files` | Output | string | — | JSON array of `{ LogicalName, PhysicalName, Type, SizeBytes }` |

**Result Codes**:
- `SUCCESS` — Header and file list inspected successfully
- `MISSING_PARAMETER` — Required parameters missing
- `INVALID_PARAMETER` — BackupUrls contains no valid URLs or paths
- `INSPECTION_FAILED` — SQL Server error during inspection

---

## Archive seed

Seeding an integration from a SQL Server backup archive runs as three separate actions so a server-side job can drive each phase, retry the load without restoring again, and always clean up. The job calls them in order: restore, load, drop. They share the progress run passed as `ProgressRunID`; the calling job owns that run and completes it, and a failure in any phase fails it.

### 5. Restore SQL Server Backup To Staging

**Action Name**: `Restore SQL Server Backup To Staging`

Restores the backup into a named staging database and stops. The staging database must not already exist.

| Parameter | Direction | Type | Required | Description |
|-----------|-----------|------|----------|-------------|
| `CompanyIntegrationID` | Input | string | Yes | ID of the Company Integration being seeded |
| `BackupUrls` | Input | string | Yes | One backup URL or path, or a comma-separated list for a striped backup |
| `StagingDatabaseName` | Input | string | Yes | Database to restore into |
| `SasToken` | Input | string | No | SAS token for Azure Blob container access (redacted from logs) |
| `StorageCredentialID` | Input | string | No | MJ Credentials record ID storing the SAS token |
| `TargetDataFileDirectory` | Input | string | No | Where the staging data files go |
| `TargetLogFileDirectory` | Input | string | No | Where the staging log file goes |
| `ProgressRunID` | Input | string | No | Integration progress run to report stages to |
| `BackupStartDate` | Output | string | — | ISO UTC time the backup began; the load phase seeds watermarks to it |
| `BackupDatabaseName` | Output | string | — | Source database recorded in the backup header |
| `StagingDatabaseName` | Output | string | — | The restored staging database |
| `ContainerUrl` | Output | string | — | Storage container whose SQL Server credential was registered (empty for local paths) |

**Result Codes**: `SUCCESS`, `MISSING_PARAMETER`, `INVALID_PARAMETER` (BackupUrls holds no valid URL or path), `RESTORE_FAILED`

### 6. Load SQL Server Integration From Staging

**Action Name**: `Load SQL Server Integration From Staging`

Loads every active entity map's table from the staging database into the target tables and seeds the loaded maps' watermarks to `BackupStartDate`. A failed load keeps the staging database so it can be retried.

| Parameter | Direction | Type | Required | Description |
|-----------|-----------|------|----------|-------------|
| `CompanyIntegrationID` | Input | string | Yes | ID of the Company Integration being seeded |
| `StagingDatabaseName` | Input | string | Yes | The restored staging database; it must exist |
| `BackupStartDate` | Input | string | Yes | ISO UTC backup start, as the restore phase reported it |
| `BatchSize` | Input | number | No | Chunk size for large tables (default 500,000; 0 for unchunked) |
| `TruncateTargetBeforeLoad` | Input | string | No | `'true'` empties each target first (default `'false'`) |
| `EntityMapIDs` | Input | string | No | Entity map IDs to restrict the load to |
| `DropStagingDbOnComplete` | Input | string | No | `'true'` drops the staging database afterwards (default `'false'`) |
| `ContainerUrl` | Input | string | No | Container whose SQL Server credential is dropped with the staging database |
| `ProgressRunID` | Input | string | No | Integration progress run to report stages to |
| `BackupStartDate` | Output | string | — | The date the watermarks were seeded to |
| `StagingDatabaseName` | Output | string | — | The staging database that was loaded |
| `TablesProcessed` | Output | number | — | Entity map tables loaded |
| `TotalRowsTransferred` | Output | number | — | Rows moved into the target tables |
| `DurationSeconds` | Output | number | — | Execution time of the phase |
| `StagingDatabaseDropped` | Output | boolean | — | Whether the staging database was dropped |

**Result Codes**: `SUCCESS`, `MISSING_PARAMETER`, `INVALID_PARAMETER` (BackupStartDate is not a valid date), `STAGING_NOT_FOUND`, `LOAD_FAILED`

### 7. Drop SQL Server Staging Database

**Action Name**: `Drop SQL Server Staging Database`

Drops the staging database and, when the restore read from storage, its SQL Server storage credential. Dropping a database that no longer exists succeeds, so the job can always run this phase.

| Parameter | Direction | Type | Required | Description |
|-----------|-----------|------|----------|-------------|
| `StagingDatabaseName` | Input | string | Yes | The staging database to drop |
| `ContainerUrl` | Input | string | No | Container whose SQL Server credential is dropped too |
| `CompanyIntegrationID` | Input | string | No | Recorded on the progress run's manifest only |
| `ProgressRunID` | Input | string | No | Integration progress run to report the stage to |
| `StagingDatabaseDropped` | Output | number | — | `1` once the database is gone |

**Result Codes**: `SUCCESS`, `MISSING_PARAMETER`, `DROP_FAILED`

### Product decisions

These are decisions of the current release, recorded so they can be revisited.

- **A. One SQL Server connection per workspace.** The archive seed refuses to start when another SQL Server company integration exists. Per-connection catalog and schema scoping is a follow-up.
- **B. Seeded entities carry no record-change history.** Seeded entities keep `AllowDirectSQLInsert = true`, with `TrackRecordChanges` and `TrustServerCacheCompletely` off permanently, so they have no record-change history and the Bootstrap re-seed keeps working.

### Operator walkthrough (Explorer)

An `archive-seed` pending-work job in MJAPI drives the three actions; Explorer's Integrations dashboard drives the job.

1. **Integrations → Add Integration → SQL Server → Choose an archive.** (The other choice, credentials, connects to a live server as before.)
2. **Pick the backup.** Choose Local Disk File (a path the SQL Server instance can read, e.g. a path inside the SQL Server container) or Azure Blob Storage, verify it, then **Restore**. The job restores the backup into a new staging database on the API's own SQL Server (`Restore SQL Server Backup To Staging`).
3. **Choose tables.** The job reads the staging database through an External Data Source in `authMode: "host"` mode, which connects with MJAPI's own SQL login and names the staging database in `DefaultDatabase`. Keep Select all or untick tables (views are listed too; untick them).
4. **Create and load.** The job creates the selected tables as MJ entities, runs CodeGen and restarts MJAPI; the wizard waits for the API to come back and reconnects. The job resumes after the restart and loads the tables (`Load SQL Server Integration From Staging`), seeding each map's watermark to the backup's start time.
5. **Remove the archive.** Choose Remove when the load finishes: the job drops the staging database (`Drop SQL Server Staging Database`).
6. The integration's card shows **Seeded · source not connected**: the data is in MJ, and the live source can be connected later to sync changes made after the backup.

### Running it on a development machine

- **The build step restarts MJAPI.** Set `RSU_RESTART_COMMAND` to a command that restarts the API process, or run the API under PM2 (process name `mjapi`, or set `RSU_PM2_PROCESS_NAME`). Without either, the restart falls back to `pm2 start ecosystem.config.cjs`, the running API is not restarted, and the new entities never reach it, so the load does not run.
- **MJAPI's SQL login must be allowed to restore.** `RESTORE DATABASE` into a new database needs `CREATE ANY DATABASE` (for example the `dbcreator` server role). A least-privilege login such as `MJ_Connect` fails the restore.
- `authMode: "host"` needs MJAPI to connect with a SQL login (user and password); with any other authentication host mode is unavailable and the data source is refused.

### Test coverage

The deterministic integration tier's `archive-seed` bundle (`IT138 - Archive Seed (staging actions and host data source)`) runs the drop against a throwaway database, connects a host-mode data source through `ExternalDataSourceRouter`, and checks that a load against a missing staging database fails with `STAGING_NOT_FOUND`. The tier has no `.bak` fixture, so the restore itself is covered by this package's unit tests and by a manual run of the walkthrough above.

---

## Scheduling via MJ Scheduler

1. Create an `MJ: Actions` record pointing to the desired action.
2. Configure input parameters.
3. Attach to a Scheduled Job in MemberJunction.
