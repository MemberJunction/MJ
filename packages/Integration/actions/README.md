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
| `TruncateTargetBeforeLoad`| Input | string | No | `'true'` or `'false'` (default: `'false'`) to truncate target tables before load for safe re-runs; each target entity must have `AllowDirectSQLDelete` |
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
| `StagingDatabaseName` | Both | string | Yes | Database to restore into; echoed back as the restored staging database |
| `SasToken` | Input | string | No | SAS token for Azure Blob container access (redacted from logs) |
| `StorageCredentialID` | Input | string | No | MJ Credentials record ID storing the SAS token |
| `TargetDataFileDirectory` | Input | string | No | Where the staging data files go |
| `TargetLogFileDirectory` | Input | string | No | Where the staging log file goes |
| `ProgressRunID` | Input | string | No | Integration progress run to report stages to |
| `BackupStartDate` | Output | string | — | ISO UTC time the backup began; the load phase seeds watermarks to it |
| `BackupDatabaseName` | Output | string | — | Source database recorded in the backup header |
| `ContainerUrl` | Output | string | — | Storage container whose SQL Server credential was registered (empty for local paths) |

**Result Codes**: `SUCCESS`, `MISSING_PARAMETER`, `INVALID_PARAMETER` (BackupUrls holds no valid URL or path), `STAGING_NOT_ACCESSIBLE` (the restore succeeded but MJAPI's SQL login cannot open the staging database; the staging database is dropped and the message names the remedy), `RESTORE_FAILED`

### 6. Load SQL Server Integration From Staging

**Action Name**: `Load SQL Server Integration From Staging`

Loads every active entity map's table from the staging database into the target tables and seeds the loaded maps' watermarks to `BackupStartDate`. A failed load keeps the staging database so it can be retried.

| Parameter | Direction | Type | Required | Description |
|-----------|-----------|------|----------|-------------|
| `CompanyIntegrationID` | Input | string | Yes | ID of the Company Integration being seeded |
| `StagingDatabaseName` | Both | string | Yes | The restored staging database; it must exist. Echoed back on success |
| `BackupStartDate` | Both | string | Yes | ISO UTC backup start, as the restore phase reported it; the date the watermarks were seeded to |
| `BatchSize` | Input | number | No | Chunk size for large tables (default 500,000; 0 for unchunked) |
| `TruncateTargetBeforeLoad` | Input | string | No | `'true'` empties each target first (default `'false'`); each target entity must have `AllowDirectSQLDelete` |
| `EntityMapIDs` | Input | string | No | Entity map IDs to restrict the load to |
| `DropStagingDbOnComplete` | Input | string | No | `'true'` drops the staging database afterwards (default `'false'`); refused as for the drop action below, checked before anything loads |
| `AllowAnyName` | Input | string | No | `'true'` lets `DropStagingDbOnComplete` drop a name outside `MJ_Staging_` (default `'false'`); requires `CreatedAfter` |
| `CreatedAfter` | Input | string | No | ISO UTC time; `DropStagingDbOnComplete` refuses a database created before it |
| `ContainerUrl` | Input | string | No | Container whose SQL Server credential is dropped with the staging database |
| `ProgressRunID` | Input | string | No | Integration progress run to report stages to |
| `TablesProcessed` | Output | number | — | Entity map tables loaded |
| `TotalRowsTransferred` | Output | number | — | Rows moved into the target tables |
| `DurationSeconds` | Output | number | — | Execution time of the phase |
| `StagingDatabaseDropped` | Output | boolean | — | Whether the staging database was dropped |

**Result Codes**: `SUCCESS`, `MISSING_PARAMETER`, `INVALID_PARAMETER` (BackupStartDate is not a valid date), `STAGING_NOT_FOUND`, `STAGING_NOT_ALLOWED` (the source is a system database or the server's own database, or lacks the `MJ_Staging_` prefix without `AllowAnyName` and a `CreatedAfter` its creation date satisfies), `DROP_REFUSED` (the requested drop-on-complete is not allowed), `LOAD_FAILED`

### 7. Drop SQL Server Staging Database

**Action Name**: `Drop SQL Server Staging Database`

Drops the staging database and, when the restore read from storage, its SQL Server storage credential; with `DropDatabase` `'false'` it drops only the credential and keeps the database. Dropping a database that no longer exists succeeds, so the job can always run this phase.

Every drop is guarded, here and in the load's `DropStagingDbOnComplete`: a system database (`master`, `model`, `msdb`, `tempdb`) and the database the server itself runs on (`DB_NAME()`) are always refused; a name that does not start with `MJ_Staging_` is refused unless `AllowAnyName` is `'true'` and `CreatedAfter` is given; and with `CreatedAfter`, a database whose `create_date` is earlier is refused, so a staging name that collides with an existing database never drops it. The archive seed job passes `CreatedAfter` (the moment its restore started) on every drop and never passes `AllowAnyName`.

| Parameter | Direction | Type | Required | Description |
|-----------|-----------|------|----------|-------------|
| `StagingDatabaseName` | Input | string | Unless `DropDatabase` is `'false'` | The staging database to drop |
| `ContainerUrl` | Input | string | When `DropDatabase` is `'false'` | Container whose SQL Server credential is dropped too |
| `DropDatabase` | Input | string | No | `'false'` drops only the storage credential (default `'true'`) |
| `CreatedAfter` | Input | string | No | ISO UTC time; refuse a database created before it |
| `AllowAnyName` | Input | string | No | `'true'` allows a name outside `MJ_Staging_` (default `'false'`); requires `CreatedAfter` |
| `CompanyIntegrationID` | Input | string | No | Recorded on the progress run's manifest only |
| `ProgressRunID` | Input | string | No | Integration progress run to report the stage to |
| `StagingDatabaseDropped` | Output | number | — | `1` once the database is gone, `0` when it was kept (`DropDatabase` `'false'`) |

**Result Codes**: `SUCCESS`, `MISSING_PARAMETER`, `INVALID_PARAMETER` (CreatedAfter is not a valid date, or ContainerUrl is not an Azure Blob container URL), `DROP_REFUSED`, `DROP_FAILED`

### Product decisions

These are decisions of the current release, recorded so they can be revisited.

- **A. One SQL Server connection per workspace.** The archive seed refuses to start when another SQL Server company integration exists. Per-connection catalog and schema scoping is a follow-up. A connection left by a *failed* seed does not count: the next archive seed deletes it (with its job row and data source) and starts fresh, since it holds no data. Deleting a seeded connection from the Integrations page removes its archive-seed job rows (their foreign key would otherwise block the delete) and then its data source; a seed that is still running cannot be deleted. A finished seed is never replaced automatically.
- **B. Seeded entities carry no record-change history.** Seeded entities keep `AllowDirectSQLInsert = true`, with `TrackRecordChanges` and `TrustServerCacheCompletely` off permanently, so they have no record-change history and the Bootstrap re-seed keeps working.
- **D. Which tables an archive offers.** Discovery introspects every schema of the restored database except SQL Server's own (`sys`, `INFORMATION_SCHEMA`, `guest`) and MemberJunction's own (`__mj`, `__mj_*`, the platform metadata a backup of another MJ database carries), and lists tables schema-qualified (`village.Contacts`). The data source's single default schema (`dbo`) is not enough: an archive routinely keeps its tables elsewhere. A live SQL Server connection still introspects its `DefaultSchema` only.
- **C. Who may run the backup actions.** The server refuses every action to a non-Owner unless an `MJ: Action Authorizations` row links it to an authorization one of the user's roles holds. The six backup actions (Bootstrap, Restore, Load, Drop, List Azure Backup Blobs, Inspect) link to `Integrations: Bootstrap From Backup`, granted to the Developer and Integration roles (`metadata/authorizations/.integrations.json`, `metadata/authorization-roles/.integrations-roles.json`). The archive seed GraphQL operations apply the Bootstrap action's gate. A user holding neither role sees "Not authorized to run action …" from the wizard; grant the authorization to another role in metadata rather than making the user an Owner.

### Operator walkthrough (Explorer)

An `archive-seed` pending-work job in MJAPI drives the three actions; Explorer's Integrations dashboard drives the job.

1. **Integrations → Add Integration → SQL Server → Choose an archive.** (The other choice, credentials, connects to a live server as before.)
2. **Pick the backup.** Choose Local Disk File (a path the SQL Server instance can read, e.g. a path inside the SQL Server container) or Azure Blob Storage, verify it, then **Restore**. The job restores the backup into a new staging database on the API's own SQL Server (`Restore SQL Server Backup To Staging`).
3. **Choose tables.** The job reads the staging database through an External Data Source in `authMode: "host"` mode, which connects with MJAPI's own SQL login and names the staging database in `DefaultDatabase`. Every user schema is listed (decision D), with tables named `schema.table`. Keep Select all or untick tables (views are listed too; untick them). **Cancel Seed** abandons the seed here: the job fails as cancelled, the staging database is dropped, and the connection can be deleted or replaced by the next seed.
4. **Create and load.** The job creates the selected tables as MJ entities, runs CodeGen and restarts MJAPI; the wizard waits for the API to come back and reconnects. The job resumes after the restart and loads the tables (`Load SQL Server Integration From Staging`), seeding each map's watermark to the backup's start time.
5. **Remove the archive.** Choose Remove when the load finishes: the job drops the staging database (`Drop SQL Server Staging Database`). Choosing Keep (or making no choice for 24 hours) keeps the database but still drops the storage credential.
6. The integration's card shows **Seeded · source not connected**: the data is in MJ, and the live source can be connected later to sync changes made after the backup.

### Prerequisites for an MJ instance that seeds from a backup

These hold for any deployment, not only a development machine. The job fails fast with a named reason when one is missing.

**1. The SQL Server login MJAPI connects with** (`DB_USERNAME` / `DB_PASSWORD`). The restore, the staging reads and the drop all run as this login, and `authMode: "host"` reuses it, so it must be SQL authentication (a user and password; Entra or Windows authentication cannot be used for the staging data source). Server-level grants, once per instance:

```sql
ALTER SERVER ROLE dbcreator ADD MEMBER [<api login>];      -- RESTORE DATABASE into a new database, ALTER/DROP it afterwards
GRANT CONNECT ANY DATABASE TO [<api login>];               -- open the restored staging database
GRANT SELECT ALL USER SECURABLES TO [<api login>];         -- read its tables for discovery and the load
```

Why the last two: a database restored from another server keeps that server's `dbo` SID, and SQL Server maps a login to `dbo` only when the SIDs match. A login that is not sysadmin is therefore refused by the database it just restored and owns (error 18456 state 38), and only a sysadmin can re-sync the owner with `ALTER AUTHORIZATION`. The two grants let the login connect and read without the owner mapping; the alternative is running MJAPI with a sysadmin login. A database the login *creates* has no mismatch, so this only bites restores. The restore phase checks the access and fails with `STAGING_NOT_ACCESSIBLE` when it is missing. A least-privilege login such as a stock `MJ_Connect` (db_owner on the MJ database only) fails the restore itself.

**2. The staging database lives on the MJ database's own SQL Server instance.** The restore needs disk for the full database (the backup is compressed; `RESTORE HEADERONLY` reports the size, and the Inspect step shows it), and the default data and log directories, or `TargetDataFileDirectory` / `TargetLogFileDirectory` on the Restore action.

**3. The backup must be readable by the SQL Server service**, not by MJAPI: a path on the SQL Server host (inside the container, for a containerized server), or an Azure Blob URL with a SAS token or a stored storage credential. Reading a storage credential needs `MJ_BASE_ENCRYPTION_KEY` to be configured.

**3a. Where backups and staging files may live.** The backup actions are callable directly (`RunAction`) by any holder of the authorization in item 6, so every location is validated in the actions before any SQL runs, and a bad one is refused with `INVALID_PARAMETER`:

- A URL source must be `https://<account>.blob.core.windows.net/<container>/<blob>` (or the `.blob.core.usgovcloudapi.net` / `.blob.core.chinacloudapi.cn` equivalents), with no query string: pass the SAS token as `SasToken` or `StorageCredentialID`, never inside the URL. A `ContainerUrl` must name exactly one container. `List Azure Backup Blobs` fetches nothing else.
- A disk source and `TargetDataFileDirectory` / `TargetLogFileDirectory` must be local paths: a UNC share (`\\host\share`, `//host/share`), a `..` segment, and the characters `'`, `"`, `]` and NUL are refused.
- `MJ_BACKUP_DISK_ROOTS` (optional, MJAPI's environment): comma-separated absolute directories on the SQL Server host, such as `/var/opt/mssql/backup,D:\Backups`. When set, a disk source must be inside one of them. Set it on any instance where the SQL Server service account can read backups that its MJ users should not restore.
- `MJ_STAGING_FILE_ROOTS` (optional, MJAPI's environment): comma-separated absolute directories on the SQL Server host. When set, `TargetDataFileDirectory` and `TargetLogFileDirectory` must be one of them or inside one. Without it, any local directory the service account can write to is accepted.
- A `StorageCredentialID` is used only when the caller can read that `MJ: Credentials` row.

**4. The runtime schema pipeline must be enabled and MJAPI restartable by the job.** The build step runs MJ's Runtime Schema Update pipeline, which is off by default: set `ALLOW_RUNTIME_SCHEMA_UPDATE=1` in MJAPI's environment, or the job fails at once with "Runtime Schema Update is disabled". The pipeline creates the entities, runs CodeGen and compiles, then restarts the API so the new entities load. CodeGen runs against `RSU_WORK_DIR` (default: MJAPI's working directory): point it at the directory `mj codegen` is normally run from, the one holding `mj.config.cjs` with the CodeGen `output` paths, or the generated files land relative to the wrong folder. Run MJAPI under PM2 (process name `mjapi`, or set `RSU_PM2_PROCESS_NAME`) or set `RSU_RESTART_COMMAND` to a command that recycles the API process (for example, under a supervisor that restarts on exit: `kill -TERM $PPID`). Without either, the job fails at once with "The API did not restart after creating tables; configure RSU_RESTART_COMMAND or run MJAPI under PM2". The RSU pipeline's own requirements apply: CodeGen credentials (`CODEGEN_DB_USERNAME` / `CODEGEN_DB_PASSWORD`) with DDL rights on the MJ database, and a working directory where CodeGen and the compile can run (`RSU_WORK_DIR`, `RSU_CODEGEN_DIR`).

**5. A node that runs background workers.** On an `MJ_SERVER_ROLE=api` node the start is refused; the job's phases run in, and resume on, the node that started it.

**6. The caller holds the authorization** (decision C): a role with `Integrations: Bootstrap From Backup` (Developer and Integration by default), and the SQL Server connector Open App installed (`mj app install`).

### Test coverage

The deterministic integration tier's `archive-seed` bundle (`IT147 - Archive Seed (staging actions and host data source)`) runs the drop against a throwaway database, connects a host-mode data source through `ExternalDataSourceRouter`, and checks that a load against a missing staging database fails with `STAGING_NOT_FOUND`. The tier has no `.bak` fixture, so the restore itself is covered by this package's unit tests and by a manual run of the walkthrough above.

---

## Scheduling via MJ Scheduler

1. Create an `MJ: Actions` record pointing to the desired action.
2. Configure input parameters.
3. Attach to a Scheduled Job in MemberJunction.
