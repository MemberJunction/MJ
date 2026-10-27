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
| `StagingDatabaseName` | Input | string | No | Temporary staging database name (default: auto-generated) |
| `DropStagingDbOnComplete`| Input | string | No | `'true'` or `'false'` (default: `'true'`) to drop staging DB on completion |
| `TruncateTargetBeforeLoad`| Input | string | No | `'true'` or `'false'` (default: `'false'`) to truncate target tables before load for safe re-runs |
| `BatchSize` | Input | number | No | Chunk batch size for large table transfers (default: 500,000; 0 for unchunked) |
| `TargetDataFileDirectory` | Input | string | No | Custom directory for staging database .mdf file |
| `TargetLogFileDirectory` | Input | string | No | Custom directory for staging database .ldf file |
| `EntityMapIDs` | Input | string | No | Comma-separated list of specific EntityMapIDs to restrict bootstrap |
| `BackupStartDate` | Output | string | — | Point-in-time timestamp (ISO UTC) when backup began (seeds watermarks) |
| `StagingDatabaseName` | Output | string | — | Staging database name created |
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
| `CompanyIntegrationID` | Input | string | Yes | ID of the Company Integration being inspected |
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

## Scheduling via MJ Scheduler

1. Create an `MJ: Actions` record pointing to the desired action.
2. Configure input parameters.
3. Attach to a Scheduled Job in MemberJunction.
