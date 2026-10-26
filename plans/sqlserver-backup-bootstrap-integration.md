# Implementation Plan: SQL Server Backup Bootstrap Integration

**Branch:** `feat/sqlserver-backup-bootstrap-integration`  
**Status:** Proposed  
**Owners:** Core Integration Team (`@memberjunction/integration-engine`, `@memberjunction/integration-actions`, `@memberjunction/integration-connectors`, `@memberjunction/explorer-dashboards`)  
**Target Release:** v6.3.0  
**Related Plans:** [`plans/sync-composition-axes.md`](sync-composition-axes.md), [`plans/scheduled-job-engine-heartbeat-lease.md`](scheduled-job-engine-heartbeat-lease.md)

---

## 1. Executive Summary & Problem Statement

### 1.1 The High-Latency / Cost Bottleneck of Large-Scale Integrations
When onboarding external SQL Server databases into MemberJunction that exceed several hundred gigabytes up to 2–3 Terabytes (e.g., enterprise ERPs, transaction ledgers, historical CRM databases), traditional network-based extract-transform-load (ETL) mechanisms face prohibitive limitations:

1. **Network Throughput & Transfer Latency:** Over standard WAN/VPN connections, network throughput typically bottlenecks between 15 MB/s and 50 MB/s. Transferring a 2.5 TB database at sustained 30 MB/s requires approximately **23.7 hours** of continuous, uninterrupted network streaming. Any transient network partition or socket reset aborts long-running batches.
2. **Source Production Locking & Overhead:** Running high-volume `SELECT` queries (even with `WITH (NOLOCK)`) against a live primary production OLTP database drives high CPU overhead, pollutes the source buffer pool, causes lock escalation, and bloats transaction log truncation points.
3. **Offset Scanning Degradation:** As tables scale past tens of millions of rows, naive offset-based query paging (`OFFSET n ROWS FETCH NEXT m ROWS ONLY`) suffers an $O(N^2)$ I/O penalty, forcing SQL Server to scan and discard millions of index leaf pages for each batch.
4. **Ingress/Egress Costs:** Transferring multi-terabyte datasets across cloud boundaries or availability zones incurs substantial egress bandwidth costs.

### 1.2 The Solution: Staged Azure Blob Backup Restore & Local High-Speed ETL
Most enterprise SQL Server deployments on Azure (or on-premises with Azure Blob connectivity) already maintain regular automated database backups (`.bak` files) in Azure Blob Storage via native SQL Server `BACKUP DATABASE ... TO URL` or Azure Managed Instance backups.

This implementation plan introduces the **SQL Server Backup Bootstrap Integration** pipeline. Rather than streaming petabytes of row data over HTTP/ODBC connections:
1. SQL Server directly restores an existing Azure Blob full backup stripe into a dedicated local staging database (`[StagingDB]`) using SQL Server’s native `RESTORE DATABASE ... FROM URL`.
2. The exact temporal watermark (`BackupStartDate`) is captured directly from backup metadata via `RESTORE HEADERONLY`.
3. High-performance, set-based, minimally-logged local ETL statements (`INSERT INTO Target WITH (TABLOCK) SELECT NEWSEQUENTIALID(), SourceRecordID, ... FROM Staging`) stream data locally across databases at hardware I/O bus speeds (500 MB/s to 2+ GB/s).
4. `MJ: Company Integration Sync Watermarks` is seeded with `BackupStartDate`, seamlessly transitioning the integration pipeline to incremental delta sync mode via `BaseExternalDataSourceConnector` with zero data loss or duplication.
5. The temporary staging database is safely dropped, freeing 2–3 TB of storage.

```
+--------------------------------------------------------------------------------------------------+
|                                    AZURE BLOB STORAGE                                            |
|   +------------------------------------------------------------------------------------------+   |
|   | backup_stripe_01.bak | backup_stripe_02.bak | backup_stripe_03.bak | backup_stripe_04.bak |   |
|   +------------------------------------------------------------------------------------------+   |
+--------------------------------------------------------------------------------------------------+
                                        │
                                        │  1. RESTORE HEADERONLY (Extract BackupStartDate)
                                        │  2. Direct RESTORE DATABASE [StagingDB] FROM URL (Local Bus)
                                        ▼
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|                                   TARGET SQL SERVER INSTANCE                                     |
|                                                                                                  |
|   ┌──────────────────────────────┐                ┌──────────────────────────────────────────┐   |
|   │     STAGING DATABASE         │                │             MEMBERJUNCTION               │   |
|   │        [StagingDB]           │                │             TARGET DATABASE              │   |
|   │                              │                │                                          │   |
|   │  ┌────────────────────────┐  │                │  ┌────────────────────────────────────┐  │   |
|   │  │ [dbo].[SalesOrder]     │──┼────────────────┼─►│ [erp].[SalesOrder]                 │  │   |
|   │  │ (35,000,000 rows)      │  │ Local Fast ETL │  │ (Minimally-logged INSERT TABLOCK)  │  │   |
|   │  └────────────────────────┘  │                │  └────────────────────────────────────┘  │   |
|   │  ┌────────────────────────┐  │                │  ┌────────────────────────────────────┐  │   |
|   │  │ [dbo].[Customer]       │──┼────────────────┼─►│ [erp].[Customer]                   │  │   |
|   │  │ (5,200,000 rows)       │  │                │  │ (Minimally-logged INSERT TABLOCK)  │  │   |
|   │  └────────────────────────┘  │                │  └────────────────────────────────────┘  │   |
|   └──────────────────────────────┘                └──────────────────────────────────────────┘   |
|                  │                                                      ▲                        |
|                  │ 5. DROP DATABASE                                     │ 4. Seed Watermark      |
|                  ▼    (Reclaim 2-3TB)                                   │    (BackupStartDate)   |
|              (DELETED)                            ┌──────────────────────────────────────────┐   |
|                                                   │ MJ: Company Integration Sync Watermarks  │   |
|                                                   └──────────────────────────────────────────┘   |
|                                                                         ▲                        |
|                                                                         │ 6. Incremental Pulls   |
|                                                   ┌──────────────────────────────────────────┐   |
|                                                   │ BaseExternalDataSourceConnector          │   |
|                                                   │ (Keyset Seek Pagination: No OFFSET scan) │   |
+───────────────────────────────────────────────────┴──────────────────────────────────────────┴───+
```

---

## 2. Performance & Cost Comparative Analysis

| Dimension | Traditional Network ETL Ingestion | SQL Server Staged Backup Bootstrap | Improvement Factor |
|---|---|---|---|
| **Transfer Rate** | 15 – 35 MB/s (WAN / REST / TDS connection) | 400 – 1,200 MB/s (Direct Blob restore via ExpressRoute/Azure Backbone) | **15x – 40x faster** |
| **Duration (2.5 TB)** | 22 – 48 hours | 45 min restore + 35 min local ETL = **~1.3 hours** | **~25x speedup** |
| **Source Production Load** | High CPU, lock contention, buffer pool churn, long transaction times | **Zero impact** on production OLTP (reads from static backup file) | **Zero production overhead** |
| **Paging Latency ($O(N^2)$ vs $O(N)$)** | Severe index scan degradation using `OFFSET ... ROWS` | Set-based bulk insert, subsequent deltas use **Keyset / Seek pagination** | Eliminates pagination stall |
| **Transaction Log Overhead** | Full logging across billions of single/batch INSERTs (causes log bloat) | **Minimally-logged bulk insert** with `TABLOCK` under bulk-logged recovery | **>80% log write reduction** |
| **Network Resilience** | Any transient socket drop requires complex cursor recovery or full restart | Native multi-threaded restore handles blob retry; atomic local database operations | **Enterprise reliability** |

---

## 3. Architecture & Pipeline Stages

The bootstrap integration is structured as a five-stage linear pipeline executed by an MJ Action, followed by continuous delta synchronizations:

```mermaid
sequenceDiagram
    autonumber
    participant UI as Explorer Dashboard UI
    participant Action as BootstrapSQLServerAction
    participant Cred as CredentialEngine
    participant SB as SchemaBuilder
    participant SQL as SQL Server (Target Instance)
    participant Blob as Azure Blob Storage
    participant WS as WatermarkService
    participant Connector as BaseExternalDataSourceConnector

    UI->>Action: RunAction("Bootstrap SQL Server Integration From Backup", Params)
    Action->>Cred: Resolve Azure Storage SAS Token / Credential
    Cred-->>Action: Resolved Storage Key / SAS Token

    Note over Action,SQL: Stage 1: Schema Preparation
    Action->>SB: BuildSchema(TargetTableConfigs)
    SB-->>Action: DDL Scripts + Soft FK Metadata
    Action->>SQL: Execute DDL (Create target tables, standard MJ columns, indexes)

    Note over Action,SQL: Stage 2: Azure Blob Restore & Watermark Inspection
    Action->>SQL: CREATE CREDENTIAL [https://<account>.blob.core.windows.net/<container>]
    Action->>SQL: RESTORE HEADERONLY FROM URL = '...'
    SQL->>Blob: Inspect backup header
    Blob-->>SQL: Backup metadata header
    SQL-->>Action: BackupStartDate, BackupFinishDate, LSNs
    Action->>SQL: RESTORE FILELISTONLY FROM URL = '...'
    SQL-->>Action: Data & Log Logical Names
    Action->>SQL: RESTORE DATABASE [StagingDB] FROM URL = '...' WITH MOVE ..., NOUNLOAD, STATS = 5
    SQL->>Blob: Stream backup blocks directly into [StagingDB] .mdf / .ldf files
    SQL-->>Action: Restore completed successfully

    Note over Action,SQL: Stage 3: Fast Local ETL
    loop For each mapped entity / table
        Action->>SQL: INSERT INTO [TargetSchema].[Table] WITH (TABLOCK) SELECT ... FROM [StagingDB].[Schema].[Table]
        SQL-->>Action: Table row count inserted
    end

    Note over Action,WS: Stage 4: Watermark Initialization
    Action->>WS: Seed Watermark (EntityMapID, BackupStartDate, Direction='Pull')
    WS-->>Action: Watermark records saved

    Note over Action,SQL: Stage 5: Post-Restore Cleanup
    alt DropStagingDbOnComplete = true
        Action->>SQL: ALTER DATABASE [StagingDB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [StagingDB]
        Action->>SQL: DROP CREDENTIAL [https://<account>.blob.core.windows.net/<container>]
        SQL-->>Action: Staging DB & temporary credential dropped (Reclaimed 2-3TB)
    end
    Action-->>UI: Action completed (Rows transferred, Watermark initialized, Status = Success)

    Note over Connector,SQL: Subsequent Incremental Delta Syncs
    Connector->>SQL: RunView / FetchChanges using Keyset Seek (WHERE ModifiedAt >= BackupStartDate AND PK > AfterKey)
    SQL-->>Connector: Delta records without OFFSET scan penalty
```

---

### Stage 1: Schema Preparation & Introspection
Before restoring data, target integration tables must exist within the target schema (e.g., `[raw_erp].[Customers]`, `[raw_erp].[SalesOrders]`).

1. **SchemaBuilder Integration:**
   - The pipeline invokes `SchemaBuilder.BuildSchema` (`packages/Integration/schema-builder/src/SchemaBuilder.ts`) using the configured `CompanyIntegrationEntityMap` entries.
   - For each source object, the engine determines column types via `TypeMapper.ts` and emits DDL through `DDLGenerator.ts`.
2. **Standard Integration Columns:**
   Every target table includes the canonical integration tracking fields:
   - `[ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID()`: Synthetic MJ primary key.
   - `[SourceRecordID] NVARCHAR(450) NOT NULL`: Natural primary key of the record in the source database (or string representation of composite PKs).
   - `[SourceObject] NVARCHAR(255) NOT NULL`: Name of the source table / entity.
   - `[SyncedAt] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()`: Timestamp of ETL ingestion.
   - Standard engine metadata fields:
     - `[__mj_integration_SyncStatus] NVARCHAR(50) NOT NULL DEFAULT 'Active'`
     - `[__mj_integration_LastSyncedAt] DATETIMEOFFSET NULL`
     - `[__mj_integration_ContentHash] NVARCHAR(64) NULL`
     - `[__mj_integration_ExternalVersion] NVARCHAR(255) NULL`
     - `[__mj_integration_IsTombstoned] BIT NOT NULL DEFAULT 0`
3. **Clustered and Non-Clustered Indexing:**
   - **Primary Clustered Index:** `CLUSTERED INDEX CIX_<table>_ID ON [TargetSchema].[Table] ([ID])` for fast page-level sequential appends.
   - **Covering Source Record Index:** `UNIQUE NONCLUSTERED INDEX UIX_<table>_SourceRecordID ON [TargetSchema].[Table] ([SourceRecordID]) INCLUDE ([__mj_integration_LastSyncedAt], [__mj_integration_ContentHash])`.
   - Ensures subsequent incremental delta syncs achieve instant $O(\log N)$ seeks when updating or checking existing records.

---

### Stage 2: Azure Blob Restore & Header Analysis
The pipeline connects to the target SQL Server instance and executes native SQL Server storage operations directly against Azure Blob Storage.

#### 1. SQL Credential Creation
SQL Server authenticates to Azure Blob containers via a Database Scoped Credential or Server Credential:
```sql
IF NOT EXISTS (SELECT 1 FROM sys.credentials WHERE name = 'https://<storage_account>.blob.core.windows.net/<container>')
BEGIN
    CREATE CREDENTIAL [https://<storage_account>.blob.core.windows.net/<container>]
    WITH IDENTITY = 'SHARED ACCESS SIGNATURE',
    SECRET = '<sas_token_without_leading_question_mark>';
END
```

#### 2. Backup Header Inspection (`RESTORE HEADERONLY`)
Before initiating the multi-terabyte restore, the action runs `RESTORE HEADERONLY` to inspect backup metadata:
```sql
RESTORE HEADERONLY
FROM URL = 'https://<storage_account>.blob.core.windows.net/<container>/backup_stripe_01.bak';
```
Key attributes extracted from the result set:
- `BackupStartDate`: **The exact point in time when the backup began.** This timestamp is critical: any transactions that occurred after `BackupStartDate` are either in differential/log backups or must be ingested during incremental sync.
- `BackupFinishDate`: The point in time when the backup finished.
- `FirstLSN`, `LastLSN`, `CheckpointLSN`, `DatabaseBackupLSN`: Transaction log sequence numbers (used for LSN-based change tracking if CDC is enabled on the source).
- `CompatibilityLevel`, `Collation`, `DatabaseVersion`.

#### 3. Logical File Inspection (`RESTORE FILELISTONLY`)
```sql
RESTORE FILELISTONLY
FROM URL = 'https://<storage_account>.blob.core.windows.net/<container>/backup_stripe_01.bak';
```
Extracts `LogicalName`, `PhysicalName`, and `Type` (`D` for data, `L` for log). The action generates target paths under the instance's configured default data and log directories (e.g. `F:\SQLData\StagingDB_Data.mdf` and `L:\SQLLog\StagingDB_Log.ldf`).

#### 4. Direct Parallel Restore
For multi-terabyte databases, backups are typically striped across 4 to 16 blobs to maximize throughput against Azure Blob egress limits:
```sql
RESTORE DATABASE [StagingDB]
FROM 
    URL = 'https://<storage_account>.blob.core.windows.net/<container>/backup_stripe_01.bak',
    URL = 'https://<storage_account>.blob.core.windows.net/<container>/backup_stripe_02.bak',
    URL = 'https://<storage_account>.blob.core.windows.net/<container>/backup_stripe_03.bak',
    URL = 'https://<storage_account>.blob.core.windows.net/<container>/backup_stripe_04.bak'
WITH 
    MOVE 'PrimaryDataFileLogicalName' TO 'F:\SQLData\StagingDB_Data.mdf',
    MOVE 'PrimaryLogFileLogicalName' TO 'L:\SQLLog\StagingDB_Log.ldf',
    REPLACE,
    RECOVERY,
    STATS = 5;
```

---

### Stage 3: Fast Local In-Engine ETL
Once `[StagingDB]` is online on the local instance, data transfer is executed via internal set-based Transact-SQL statements rather than moving across the network.

#### 1. Minimal-Logging Execution Pattern
To prevent the target database transaction log from running out of space during a 2–3 TB load, the target database recovery model is verified (or temporarily placed in `BULK_LOGGED` mode), and table-lock bulk inserts are utilized:

```sql
-- Executed per entity map
INSERT INTO [TargetSchema].[TargetTable] WITH (TABLOCK)
(
    [ID],
    [SourceRecordID],
    [SourceObject],
    [SyncedAt],
    [__mj_integration_SyncStatus],
    [__mj_integration_LastSyncedAt],
    [__mj_integration_ContentHash],
    [CustomerNumber],
    [CompanyName],
    [BillingAddress],
    [ModifiedAt]
)
SELECT 
    NEWSEQUENTIALID() AS [ID],
    CAST(s.[CustomerID] AS NVARCHAR(450)) AS [SourceRecordID],
    'Customers' AS [SourceObject],
    @EtlExecutionTimestamp AS [SyncedAt],
    'Active' AS [__mj_integration_SyncStatus],
    @EtlExecutionTimestamp AS [__mj_integration_LastSyncedAt],
    CONVERT(NVARCHAR(64), HASHBYTES('SHA2_256', 
        CONCAT_WS('|', s.[CustomerNumber], s.[CompanyName], s.[BillingAddress])
    ), 2) AS [__mj_integration_ContentHash],
    s.[CustomerNumber],
    s.[CompanyName],
    s.[BillingAddress],
    s.[ModifiedAt]
FROM [StagingDB].[dbo].[Customers] s WITH (NOLOCK);
```

#### 2. Chunked Batched Insert for Multi-Billion Row Tables
When individual tables contain hundreds of millions of rows (e.g. general ledger entries), executing a single uncommitted transaction can exceed `tempdb` version store limits or cause log growth spikes. The engine provides an automated chunking mode based on the source table's primary key or clustered index range:

```sql
DECLARE @MinID BIGINT = (SELECT MIN([EntryID]) FROM [StagingDB].[dbo].[GeneralLedger]);
DECLARE @MaxID BIGINT = (SELECT MAX([EntryID]) FROM [StagingDB].[dbo].[GeneralLedger]);
DECLARE @BatchSize BIGINT = 500000;
DECLARE @CurrentID BIGINT = @MinID;

WHILE @CurrentID <= @MaxID
BEGIN
    INSERT INTO [TargetSchema].[GeneralLedger] WITH (TABLOCK)
    (
        [ID], [SourceRecordID], [SourceObject], [SyncedAt], [EntryDate], [Amount]
    )
    SELECT 
        NEWSEQUENTIALID(),
        CAST([EntryID] AS NVARCHAR(450)),
        'GeneralLedger',
        @EtlExecutionTimestamp,
        [EntryDate],
        [Amount]
    FROM [StagingDB].[dbo].[GeneralLedger] WITH (NOLOCK)
    WHERE [EntryID] >= @CurrentID AND [EntryID] < @CurrentID + @BatchSize;

    SET @CurrentID = @CurrentID + @BatchSize;
    CHECKPOINT; -- Truncates inactive portion of log in SIMPLE or BULK_LOGGED model
END
```

---

### Stage 4: Watermark Initialization & Incremental Sync Alignment

#### The Zero-Gap Watermark Invariant
A frequent defect in backup restores is the **temporal gap problem**:
- If the watermark is initialized to `BackupFinishDate` (e.g., 04:00 AM), all transactions that occurred between `BackupStartDate` (e.g., 01:00 AM) and `BackupFinishDate` (04:00 AM) are lost if they were modified while the backup was running.
- If the watermark is initialized to the ETL completion date (e.g., 06:00 AM), 5 hours of data are lost.

**The Solution:**
The pipeline sets the sync watermark strictly to **`BackupStartDate`** (captured during Stage 2 `RESTORE HEADERONLY`).
Because MemberJunction's incremental sync engine (`BaseExternalDataSourceConnector` and `ProcessPullSync`) implements idempotent upserts (`MERGE` or check-by-hash before insert/update), pulling records modified $\ge$ `BackupStartDate` simply updates or validates records changed during the backup window. **There is zero data loss and zero duplicate insertion.**

```
BACKUP START: 01:00 AM  (Watermark initialized HERE)
   │
   ├────── Transactions occurring between 01:00 AM - 04:00 AM
   │       (Captured in subsequent incremental sync)
   ▼
BACKUP FINISH: 04:00 AM
   │
RESTORE & ETL COMPLETE: 05:30 AM
   │
FIRST INCREMENTAL RUN:
   Fetches: WHERE ModifiedAt >= '2026-10-26T01:00:00Z'
   Outcome: Idempotently catches all mid-backup and post-backup changes.
```

#### Watermark Record Storage
The action interacts with `WatermarkService` (`packages/Integration/engine/src/WatermarkService.ts`):
- Entity: `MJ: Company Integration Sync Watermarks`
- `EntityMapID`: The UUID of the `MJ: Company Integration Entity Maps` row.
- `Direction`: `'Pull'`
- `WatermarkType`: `'Timestamp'` (or `'Cursor'` when using keyset markers)
- `WatermarkValue`: ISO-8601 UTC string of `BackupStartDate` (e.g., `'2026-10-26T01:00:00.000Z'`).
- `LastSyncAt`: Current execution timestamp.

---

### Stage 5: Post-Restore Cleanup & Storage Reclamation
Holding a 2–3 TB staging database alongside the freshly populated target tables requires 4–6 TB of disk headroom. Once Stage 3 and Stage 4 complete and verify successfully:

1. **Verification Gate:**
   - Source table row counts are queried from `[StagingDB].sys.partitions` and matched against target table row counts.
   - Any discrepancies trigger an alert before database teardown.
2. **Atomic Database Deletion:**
   ```sql
   ALTER DATABASE [StagingDB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
   DROP DATABASE [StagingDB];
   ```
3. **Credential Cleanup:**
   If the Azure Blob credential was configured as ephemeral for the bootstrap run:
   ```sql
   DROP CREDENTIAL [https://<storage_account>.blob.core.windows.net/<container>];
   ```
4. **Immediate Space Reclamation:**
   The OS-level file allocation for the staging `.mdf` and `.ldf` files is released immediately to the disk subsystem.

---

## 4. System Components & Detailed Code Locations

### 4.1 New Action: `BootstrapSQLServerIntegrationFromBackupAction`
**Location:** `packages/Integration/actions/src/BootstrapSQLServerIntegrationFromBackupAction.ts`  
**Registration:** `@RegisterClass(BaseAction, 'Bootstrap SQL Server Integration From Backup')`

#### Parameter Interface
```typescript
export interface BootstrapSQLServerIntegrationParams {
    /** Target Company Integration ID */
    CompanyIntegrationID: string;
    /** Azure Blob Storage URL to the .bak file (or array for striped backups) */
    BackupUrls: string[];
    /** MemberJunction Credential ID containing the Azure Storage SAS token or Account Key */
    StorageCredentialID?: string;
    /** Direct SAS token string (alternative to CredentialID, resolved securely) */
    SasToken?: string;
    /** Name of the temporary staging database (default: `MJ_Staging_<IntegrationID_short>`) */
    StagingDatabaseName?: string;
    /** Whether to drop the staging database upon successful ETL completion (default: true) */
    DropStagingDbOnComplete?: boolean;
    /** Override destination directory for staging MDF data files */
    TargetDataFileDirectory?: string;
    /** Override destination directory for staging LDF log files */
    TargetLogFileDirectory?: string;
    /** Maximum degree of parallelism for ETL INSERT statements (default: 4) */
    MaxDop?: number;
    /** Batch size for chunked table ingestion (default: 500,000; 0 for unchunked) */
    BatchSize?: number;
    /** Specific EntityMapIDs to restrict the bootstrap to (default: all active maps) */
    EntityMapIDs?: string[];
}
```

#### Action Implementation Outline
```typescript
import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus, Metadata } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams, ActionParam } from '@memberjunction/actions-base';
import { CredentialEngine } from '@memberjunction/credentials';
import { WatermarkService } from '@memberjunction/integration-engine';
import { SchemaBuilder } from '@memberjunction/integration-schema-builder';

interface SqlHeaderInfo {
    BackupStartDate: Date;
    BackupFinishDate: Date;
    FirstLSN: string;
    LastLSN: string;
    DatabaseName: string;
}

interface SqlFileListEntry {
    LogicalName: string;
    PhysicalName: string;
    Type: 'D' | 'L';
}

@RegisterClass(BaseAction, 'Bootstrap SQL Server Integration From Backup')
export class BootstrapSQLServerIntegrationFromBackupAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const startTime = Date.now();
        let stagingDbCreated = false;
        let stagingDbName = '';

        try {
            // 1. Validate & Parse Parameters
            const companyIntegrationID = this.getStringParam(params, 'CompanyIntegrationID');
            const backupUrlsRaw = this.getStringParam(params, 'BackupUrls');
            if (!companyIntegrationID || !backupUrlsRaw) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETERS',
                    Message: "Parameters 'CompanyIntegrationID' and 'BackupUrls' are required."
                };
            }

            const backupUrls = backupUrlsRaw.split(',').map(u => u.trim()).filter(Boolean);
            stagingDbName = this.getStringParam(params, 'StagingDatabaseName') ?? 
                `MJ_Staging_${companyIntegrationID.replace(/-/g, '').substring(0, 12)}`;
            const dropStagingOnComplete = this.getBooleanParam(params, 'DropStagingDbOnComplete', true);
            const batchSize = this.getNumberParam(params, 'BatchSize', 500000);

            // 2. Resolve Azure Storage SAS Token via CredentialEngine
            const sasToken = await this.resolveSasToken(params);

            // 3. Obtain Database Provider seam for SQL Server execution
            const provider = this.getSqlProvider();

            // 4. Create SQL Server Credential for Blob Storage
            await this.ensureStorageCredential(provider, backupUrls[0], sasToken);

            // 5. Read Backup Header & Filelist
            const headerInfo = await this.readBackupHeader(provider, backupUrls[0]);
            const fileList = await this.readBackupFileList(provider, backupUrls[0]);
            LogStatus(`[Bootstrap] Backup header analyzed: Source DB='${headerInfo.DatabaseName}', BackupStartDate=${headerInfo.BackupStartDate.toISOString()}`);

            // 6. Execute Direct Database Restore from URL
            LogStatus(`[Bootstrap] Starting native restore into [${stagingDbName}]...`);
            await this.executeDatabaseRestore(provider, stagingDbName, backupUrls, fileList, params);
            stagingDbCreated = true;

            // 7. Schema Preparation on Target
            const entityMaps = await this.loadEntityMaps(companyIntegrationID, params);
            await this.prepareTargetSchemas(entityMaps, params);

            // 8. Execute Local Set-Based Minimally-Logged ETL
            let totalRowsInserted = 0;
            const tableProgress: Array<{ Entity: string; Rows: number }> = [];

            for (const map of entityMaps) {
                LogStatus(`[Bootstrap] Running local ETL for ${map.SourceObjectName} -> ${map.TargetEntityName}...`);
                const rows = await this.executeTableEtl(provider, stagingDbName, map, batchSize, headerInfo.BackupStartDate);
                totalRowsInserted += rows;
                tableProgress.push({ Entity: map.TargetEntityName, Rows: rows });
            }

            // 9. Seed Watermark via WatermarkService
            const watermarkService = new WatermarkService();
            for (const map of entityMaps) {
                await watermarkService.Update(
                    map.EntityMapID,
                    headerInfo.BackupStartDate.toISOString(),
                    params.ContextUser,
                    'Timestamp',
                    'Pull'
                );
            }
            LogStatus(`[Bootstrap] Watermarks successfully seeded to ${headerInfo.BackupStartDate.toISOString()}`);

            // 10. Post-Restore Cleanup
            if (dropStagingOnComplete) {
                LogStatus(`[Bootstrap] Dropping staging database [${stagingDbName}]...`);
                await this.dropStagingDatabase(provider, stagingDbName);
                stagingDbCreated = false;
            }

            const durationSec = Math.round((Date.now() - startTime) / 1000);
            this.addOutputParam(params, 'BackupStartDate', headerInfo.BackupStartDate.toISOString());
            this.addOutputParam(params, 'TotalRowsInserted', totalRowsInserted);
            this.addOutputParam(params, 'DurationSeconds', durationSec);
            this.addOutputParam(params, 'StagingDatabaseDropped', dropStagingOnComplete ? 1 : 0);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully bootstrapped ${entityMaps.length} tables (${totalRowsInserted.toLocaleString()} rows) in ${durationSec}s. Watermark set to ${headerInfo.BackupStartDate.toISOString()}.`,
                Params: params.Params
            };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`[BootstrapSQLServerIntegrationFromBackupAction] Error: ${message}`);

            // Attempt fail-safe cleanup of staging database if error occurred mid-way
            if (stagingDbCreated && stagingDbName) {
                try {
                    const provider = this.getSqlProvider();
                    await this.dropStagingDatabase(provider, stagingDbName);
                } catch (cleanupErr) {
                    LogError(`[Bootstrap] Failed to clean up staging database after failure: ${cleanupErr}`);
                }
            }

            return {
                Success: false,
                ResultCode: 'BOOTSTRAP_FAILED',
                Message: message,
                Params: params.Params
            };
        }
    }

    private async resolveSasToken(params: RunActionParams): Promise<string> {
        const directSas = this.getStringParam(params, 'SasToken');
        if (directSas) return directSas.replace(/^\?/, '');

        const credId = this.getStringParam(params, 'StorageCredentialID');
        if (credId) {
            await CredentialEngine.Instance.Config(false, params.ContextUser);
            const credential = CredentialEngine.Instance.getCredentialById(credId);
            if (!credential) throw new Error(`Credential with ID '${credId}' not found in CredentialEngine.`);
            const resolved = await CredentialEngine.Instance.getCredential<{ SasToken?: string; Key?: string }>(
                credential.Name,
                { contextUser: params.ContextUser }
            );
            const token = resolved.Values?.SasToken || resolved.Values?.Key;
            if (!token) throw new Error(`Credential '${credential.Name}' does not contain a 'SasToken' or 'Key' value.`);
            return token.replace(/^\?/, '');
        }

        throw new Error("Either 'SasToken' or 'StorageCredentialID' must be provided.");
    }
    // ... helper methods for SQL execution, header parsing, and ETL chunking
}
```

---

### 4.2 Connector Enhancement: Keyset Pagination in `BaseExternalDataSourceConnector`
**Location:** `packages/Integration/connectors/src/datasource/BaseExternalDataSourceConnector.ts`

#### The Problem with Deep `OFFSET` Scanning
In the existing implementation of `BaseExternalDataSourceConnector.FetchChanges`:
```typescript
// EXISTING CODE (connectors/src/datasource/BaseExternalDataSourceConnector.ts:207-223)
const offset = ctx.CurrentOffset ?? 0;
const result = await driver.RunView(
    dataSource,
    {
        objectName: ctx.ObjectName,
        incrementalSince: ctx.WatermarkValue && meta.WatermarkField
            ? { Field: meta.WatermarkField, Value: ctx.WatermarkValue }
            : undefined,
        defaultOrderByColumns: orderColumns.length ? orderColumns : undefined,
        maxRows: ctx.BatchSize + 1,
        offset, // <-- CAUSES DEEP OFFSET SCANNING PENALTY
    },
    ctx.ContextUser,
);
```
When catching up on millions of delta records (e.g., changes that occurred since `BackupStartDate`), `offset` increments to 100,000, 200,000, etc. Under the hood, SQL Server translates this to:
```sql
SELECT ... FROM [dbo].[Orders]
WHERE [ModifiedAt] >= @Watermark
ORDER BY [ModifiedAt] ASC, [OrderID] ASC
OFFSET 250000 ROWS FETCH NEXT 5001 ROWS ONLY;
```
SQL Server must read 255,001 rows off the disk/index leaf pages and discard the first 250,000 before returning 5,000 rows. Query execution times degrade from 10ms to >30 seconds per batch.

#### The Keyset (Seek) Pagination Solution
Keyset pagination replaces `OFFSET` with a seek predicate evaluated directly against the indexed ordering keys:
$$\text{WHERE } (\text{Watermark} > \text{LastSeenWatermark}) \lor (\text{Watermark} = \text{LastSeenWatermark} \land \text{PK} > \text{LastSeenPK})$$

`BaseExternalDataSourceConnector.ts` is updated to utilize `AfterKeyValue` / composite seek markers when keyset pagination is supported:

```typescript
export class BaseExternalDataSourceConnector extends BaseIntegrationConnector {
    // ...
    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const { dataSource, driver } = await this.Resolve(ctx.CompanyIntegration, ctx.ContextUser);
        const meta = await this.ResolveObjectMeta(ctx);

        const orderColumns = [meta.WatermarkField, ...meta.PrimaryKeyFields].filter(
            (c): c is string => typeof c === 'string' && c.length > 0,
        );

        // Check if Keyset Seek Pagination is supported for this fetch
        const useKeyset = Boolean(ctx.AfterKeyValue && meta.PrimaryKeyFields.length > 0);
        const offset = useKeyset ? 0 : (ctx.CurrentOffset ?? 0);

        const result = await driver.RunView(
            dataSource,
            {
                objectName: ctx.ObjectName,
                incrementalSince: ctx.WatermarkValue && meta.WatermarkField
                    ? { Field: meta.WatermarkField, Value: ctx.WatermarkValue }
                    : undefined,
                // Provide structured keyset seek boundary to driver
                keysetSeek: useKeyset && ctx.AfterKeyValue ? {
                    PrimaryKeyFields: meta.PrimaryKeyFields,
                    WatermarkField: meta.WatermarkField,
                    AfterValue: ctx.AfterKeyValue,
                    WatermarkValue: ctx.WatermarkValue
                } : undefined,
                defaultOrderByColumns: orderColumns.length ? orderColumns : undefined,
                maxRows: ctx.BatchSize + 1,
                offset,
            },
            ctx.ContextUser,
        );

        if (!result.success) {
            throw new Error(result.errorMessage ?? `RunView failed for object '${ctx.ObjectName}'`);
        }

        const hasMore = result.rows.length > ctx.BatchSize;
        const rows = hasMore ? result.rows.slice(0, ctx.BatchSize) : result.rows;

        // Calculate next keyset resume marker from the final row in the batch
        const lastRow = rows.length > 0 ? rows[rows.length - 1] : undefined;
        const nextAfterKey = (hasMore && lastRow && meta.PrimaryKeyFields.length > 0)
            ? this.ExtractKeysetMarker(lastRow, meta.PrimaryKeyFields, meta.WatermarkField)
            : undefined;

        return {
            Records: rows.map(r => this.BuildRecord(r, ctx.ObjectName, meta.PrimaryKeyFields, meta.WatermarkField)),
            HasMore: hasMore,
            NextOffset: useKeyset ? undefined : (hasMore ? offset + ctx.BatchSize : undefined),
            AfterKeyValue: nextAfterKey,
            NewWatermarkValue: this.MaxWatermark(rows, meta.WatermarkField),
        };
    }
}
```

---

### 4.3 Explorer Dashboard UI: Staged Bootstrap Wizard & Progress Monitor
**Location:** `packages/Angular/Explorer/dashboards/src/Integration/components/bootstrap-wizard/`  
**Registration:** `integration.module.ts` (declared and exported)

The dashboard allows database administrators and integration engineers to configure, launch, and monitor the bootstrap process visually:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│  Bootstrap SQL Server Integration from Azure Backup                                       [ X ]  │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  [ (1) Source & Backup ] ───► [ (2) Inspection & Mapping ] ───► [ (3) Execution ] ───► [ (4) Done ]│
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│  Current Stage: 3. Execution & Fast Local ETL                                                    │
│                                                                                                  │
│  Staging Database: [ MJ_Staging_CorpERP_Live ] (Restored from 4 Blob Stripes)                    │
│  Backup Start Date Watermark: 2026-10-26 01:00:14 UTC                                            │
│                                                                                                  │
│  Overall Progress: [============================================            ]  78%               │
│                                                                                                  │
│  Table ETL Progress:                                                                             │
│  - [raw_erp].[Customer]          5,240,110 / 5,240,110 rows  (100%)  [ Completed ]               │
│  - [raw_erp].[ProductCatalog]      890,400 /   890,400 rows  (100%)  [ Completed ]               │
│  - [raw_erp].[SalesOrder]       28,450,000 / 35,000,000 rows  ( 81%)  [ Transferring: 850 MB/s ]   │
│  - [raw_erp].[SalesOrderDetail]          0 / 92,100,000 rows  (  0%)  [ Queued ]                 │
│                                                                                                  │
│  Telemetry:                                                                                      │
│  - Transferred: 1.84 TB / 2.35 TB                                                                │
│  - Current Throughput: 850 MB/s                                                                  │
│  - Elapsed: 38m 12s | Est. Remaining: 10m 45s                                                    │
│                                                                                                  │
│  [ ] Drop Staging Database immediately upon verification                                          │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  [ View Full Live Logs ]                                                    [ Cancel Bootstrap ] │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Key Dashboard Components
1. **`bootstrap-wizard.component.ts`**:
   - Manages four distinct wizard steps using modern Angular `@if`/`@switch` control flow and `inject()` DI.
   - Invokes `RunAction` through `IntegrationDataService`.
   - Binds to `ActionProgress` events via WebSocket/PubSub to display real-time MB/s throughput, rows transferred, and stage changes without full-page reloads.
2. **`integration-data.service.ts` Enhancements**:
   - `BootstrapFromBackup(companyIntegrationId: string, options: BootstrapOptions): Observable<BootstrapProgressEvent>`
   - `InspectBackupHeader(companyIntegrationId: string, backupUrl: string, credId: string): Promise<BackupHeaderSummary>`

---

## 5. Database, Storage & Security Considerations

### 5.1 Security & Credential Hygiene
- **Zero Raw Secret Storage:** Raw Azure Storage Account Keys or SAS tokens are never logged, never emitted in `ActionParam` audit histories, and never persisted in cleartext.
- **Scoped Shared Access Signatures (SAS):**
  - Minimum required SAS token permissions on Azure Blob Container: `Read` (`r`) and `List` (`l`). No `Write` (`w`) or `Delete` (`d`) permissions are needed.
  - Recommended SAS expiry: Window limited to bootstrap duration (e.g., 24–48 hours).
- **Transient SQL Credential Lifecycle:** Database scoped credentials created in SQL Server (`CREATE CREDENTIAL`) are dropped during Stage 5 cleanup, leaving no persistent authentication tokens on the SQL Server instance.

### 5.2 Transaction Isolation & Concurrency
- **Staging Database Isolation:** The staging database operates in `READ_COMMITTED_SNAPSHOT` or standard `READ_COMMITTED` mode. Reads against staging tables use `WITH (NOLOCK)` to avoid read-lock acquisition overhead.
- **Target Database Non-Blocking Inserts:**
  - Because target integration tables are new, the exclusive table lock (`TABLOCK`) acquired on the target table during `INSERT INTO Target WITH (TABLOCK)` does not block existing production applications querying other schemas or tables.

### 5.3 TempDB & Transaction Log Management
- **Minimal Logging with TABLOCK:**
  - In SQL Server, `INSERT INTO ... SELECT` is minimally logged under the `SIMPLE` or `BULK_LOGGED` recovery models when the `TABLOCK` hint is specified and target indexes satisfy minimal logging criteria (e.g. empty target table or heap).
  - Only extent allocations and metadata changes are logged rather than row contents, reducing log writes by up to **90%**.
- **Log Drive Sizing:**
  - Ensure the target transaction log drive has at least 15% of the total database size in free space to handle extent allocation logs and checkpoints during chunked loads.

### 5.4 Disk Sizing & Headroom Calculation
Before initiating the restore, the action verifies available disk space on the target data drive:
$$\text{Required Free Space} = \text{Staging DB Size} + (\text{Target Table Estimated Size} \times 1.15)$$
For a 2.5 TB database:
- Staging DB: 2.5 TB
- Target Tables (uncompressed): ~2.2 TB
- Temporary log/buffer headroom: 0.3 TB
- **Total required during execution:** ~5.0 TB.
- **Net usage after Stage 5 drop:** ~2.2 TB.
If the drive lacks sufficient space for simultaneous staging and target, the action fails early before initiating the restore.

---

## 6. Phased Implementation Milestones

```
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|                                    IMPLEMENTATION ROADMAP                                        |
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|  Milestone 1: Backend Action & Staging Core Engine                                               |
|  - Implement BootstrapSQLServerIntegrationFromBackupAction                                       |
|  - SQL Server RESTORE HEADERONLY / FILELISTONLY parser                                           |
|  - DDL generation integration with SchemaBuilder                                                 |
|  - Local set-based minimally logged ETL generator & runner                                      |
+──────────────────────────────────────────────────────────────────────────────────────────────────+
                                        │
                                        ▼
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|  Milestone 2: Keyset Pagination in BaseExternalDataSourceConnector                              |
|  - Add KeysetSeek configuration to Driver.RunView options                                        |
|  - Extract composite (Watermark, PK) resume markers                                             |
|  - Update SQL Server DataSource driver with seek predicate rendering                             |
|  - Eliminate OFFSET scanning for high-volume delta pulls                                         |
+──────────────────────────────────────────────────────────────────────────────────────────────────+
                                        │
                                        ▼
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|  Milestone 3: Explorer Dashboard UI (Bootstrap Wizard & Monitor)                                 |
|  - Create BootstrapWizardComponent with modern Angular control syntax (@if, @for)               |
|  - Integrate with IntegrationDataService and ActionProgress pubsub                              |
|  - Add live throughput gauges (MB/s), row progress, and stage tracking                          |
+──────────────────────────────────────────────────────────────────────────────────────────────────+
                                        │
                                        ▼
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|  Milestone 4: End-to-End Verification & Benchmarking                                             |
|  - Automated Vitest test suites for Action and Connector                                         |
|  - Performance validation against simulated 100M+ row datasets                                  |
|  - Failure recovery & cleanup tests (disk full, corrupted backup header)                         |
+──────────────────────────────────────────────────────────────────────────────────────────────────+
```

### Milestone Details
- **Milestone 1: Core Action & Staging Engine (PR 1)**
  - Add `BootstrapSQLServerIntegrationFromBackupAction.ts` to `packages/Integration/actions/`.
  - Export from `packages/Integration/actions/src/index.ts`.
  - Implement SQL credential management, `RESTORE HEADERONLY` extraction, and chunked `INSERT WITH (TABLOCK)` generator.
  - Wire watermark seeding with `WatermarkService`.

- **Milestone 2: Keyset Pagination in `BaseExternalDataSourceConnector` (PR 2)**
  - Extend `FetchContext` and `DriverRunViewOptions` to support keyset seeking.
  - Implement seek predicate formatting in `@memberjunction/external-data-sources` SQL Server driver.
  - Benchmark performance to verify $O(N)$ scanning across 10M+ rows.

- **Milestone 3: Angular Explorer UI Wizard (PR 3)**
  - Implement `BootstrapWizardComponent` in `packages/Angular/Explorer/dashboards/src/Integration/components/bootstrap-wizard/`.
  - Register in `integration.module.ts`.
  - Implement real-time progress listeners.

- **Milestone 4: Testing & Documentation (PR 4)**
  - Add unit test suite in `packages/Integration/actions/src/__tests__/BootstrapAction.test.ts`.
  - Add unit tests in `packages/Integration/connectors/src/__tests__/EdsConnectors.keyset.test.ts`.
  - Produce operational disaster recovery and runbook guide.

---

## 7. Testing & Verification Strategy

### 7.1 Unit Testing Strategy (`vitest`)
All new classes and methods must be accompanied by comprehensive unit test coverage:
1. **Action Parameter Validation Tests (`BootstrapSQLServerIntegrationFromBackupAction.test.ts`):**
   - Verify `MISSING_PARAMETERS` return codes when required fields are missing.
   - Verify SAS token format sanitation (stripping leading `?`).
   - Verify CredentialEngine lookup and error handling when credential is absent.
2. **SQL Generator Tests (`ETLGenerator.test.ts`):**
   - Verify `TABLOCK` hints are properly emitted.
   - Verify proper quoting of schemas and identifiers using `QuoteSqlServer`.
   - Verify `NEWSEQUENTIALID()` and `SourceRecordID` casting syntax.
   - Verify `HASHBYTES` content hashing matches MJ standard conventions.
3. **Keyset Pagination Tests (`BaseExternalDataSourceConnector.test.ts`):**
   - Verify that when `AfterKeyValue` is provided, `offset` is passed as 0 and `keysetSeek` contains target PK and watermark boundaries.
   - Verify that when keyset pagination is not possible, the connector gracefully falls back to offset pagination.

### 7.2 Mocking SQL Server Restore & Header Calls
To run fast in CI without a live Azure Blob storage account or 2 TB database:
```typescript
const mockDatabaseProvider = {
    ExecuteSQL: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('RESTORE HEADERONLY')) {
            return Promise.resolve([{
                BackupStartDate: new Date('2026-10-26T01:00:00Z'),
                BackupFinishDate: new Date('2026-10-26T04:00:00Z'),
                DatabaseName: 'AdventureWorks_Production',
                FirstLSN: '1000000001',
                LastLSN: '1000000050'
            }]);
        }
        if (sql.includes('RESTORE FILELISTONLY')) {
            return Promise.resolve([
                { LogicalName: 'AdventureWorks_Data', PhysicalName: 'D:\\Data.mdf', Type: 'D' },
                { LogicalName: 'AdventureWorks_Log', PhysicalName: 'L:\\Log.ldf', Type: 'L' }
            ]);
        }
        if (sql.includes('RESTORE DATABASE')) {
            return Promise.resolve([]);
        }
        if (sql.includes('INSERT INTO')) {
            return Promise.resolve([{ RowsAffected: 500000 }]);
        }
        return Promise.resolve([]);
    })
};
```

### 7.3 Integration & Failure Scenario Testing
1. **Corrupted Backup File:** Simulating a corrupt `.bak` file; verify that SQL Server error is caught, no partial target tables remain in an inconsistent state, and the staging database is cleanly rolled back and dropped.
2. **Disk Full Condition:** Simulate insufficient disk space during restore; verify the pre-check terminates execution before restore initiation.
3. **Watermark Continuity Test:**
   - Execute bootstrap with `BackupStartDate` at $T_0$.
   - Simulate modifications on source at $T_0 + 10\text{ min}$.
   - Run incremental sync; verify that all modifications are ingested into target tables without skipping records or violating unique constraints.

---

## 8. Summary of Deliverables & Files to Create / Modify

| File Path | Action | Description |
|---|---|---|
| `plans/sqlserver-backup-bootstrap-integration.md` | **Create** | The complete architectural and implementation plan (this document). |
| `packages/Integration/actions/src/BootstrapSQLServerIntegrationFromBackupAction.ts` | **Create** | The MJ Action coordinating restore, DDL, ETL, watermarks, and cleanup. |
| `packages/Integration/actions/src/index.ts` | **Modify** | Export `BootstrapSQLServerIntegrationFromBackupAction`. |
| `packages/Integration/actions/src/__tests__/BootstrapSQLServerIntegrationFromBackupAction.test.ts` | **Create** | Unit tests for the new action. |
| `packages/Integration/connectors/src/datasource/BaseExternalDataSourceConnector.ts` | **Modify** | Add keyset / seek pagination support to `FetchChanges`. |
| `packages/Integration/connectors/src/__tests__/EdsConnectors.keyset.test.ts` | **Create** | Unit tests for keyset pagination in EDS connectors. |
| `packages/Angular/Explorer/dashboards/src/Integration/components/bootstrap-wizard/` | **Create** | Angular dashboard wizard components for executing and monitoring bootstrap. |
| `packages/Angular/Explorer/dashboards/src/Integration/integration.module.ts` | **Modify** | Register the bootstrap wizard component in Explorer. |
