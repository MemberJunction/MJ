import { RegisterClass, EscapeSQLString } from '@memberjunction/global';
import { LogError, LogStatus, RunView, DatabaseProviderBase, LocalCacheManager, type UserInfo } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { WatermarkService } from '@memberjunction/integration-engine';
import { MJCompanyIntegrationEntityMapEntity } from '@memberjunction/core-entities';
import { ValidateIdentifier } from '@memberjunction/schema-engine';
import {
    BaseIntegrationAction,
    SqlBackupFileListEntry,
    SqlBackupHeaderInfo
} from './BaseIntegrationAction.js';

// Re-export shared types for backward compatibility
export type { SqlBackupHeaderInfo, SqlBackupFileListEntry } from './BaseIntegrationAction.js';

/**
 * Column schema information from INFORMATION_SCHEMA.COLUMNS.
 */
export interface SqlColumnInfo {
    COLUMN_NAME: string;
    DATA_TYPE: string;
    IS_NULLABLE: string;
}

/**
 * Summary of a table ETL transfer operation.
 */
export interface TableEtlResult {
    SourceTable: string;
    TargetTable: string;
    RowsTransferred: number;
}

/**
 * Action that performs a high-speed initial bootstrap of external SQL Server tables
 * into MemberJunction target tables using a staged Azure Blob backup restore and local in-engine ETL.
 *
 * Parameters (Input):
 *   - CompanyIntegrationID (required): ID of the CompanyIntegration being bootstrapped
 *   - BackupUrls (required): Single Azure Blob URL or comma-separated list of URLs (for striped backups)
 *   - StorageCredentialID (optional): ID of the MJ: Credentials record storing the SAS token
 *   - SasToken (optional): Direct Shared Access Signature token for the Azure Blob container
 *   - StagingDatabaseName (optional): Name for the temporary staging database (default: auto-generated)
 *   - DropStagingDbOnComplete (optional): 'true' or 'false' (default: 'true') to reclaim staging disk space
 *   - BatchSize (optional): Chunk batch size for large table transfers (default: 500,000; 0 for unchunked)
 *   - TruncateTargetBeforeLoad (optional): 'true' or 'false' (default: 'false') to truncate target before load
 *   - TargetDataFileDirectory (optional): Custom file path for staging database .mdf file
 *   - TargetLogFileDirectory (optional): Custom file path for staging database .ldf file
 *   - EntityMapIDs (optional): Comma-separated list of specific EntityMapIDs to restrict the bootstrap
 *
 * Parameters (Output):
 *   - BackupStartDate: Point-in-time timestamp (ISO UTC) when the backup began (used as the watermark)
 *   - StagingDatabaseName: Name of the staging database created
 *   - TablesProcessed: Total number of entity tables successfully transferred
 *   - TotalRowsTransferred: Total record count inserted into target tables
 *   - DurationSeconds: Total runtime in seconds
 *   - StagingDatabaseDropped: 1 if staging database was dropped, 0 if retained
 */
@RegisterClass(BaseAction, 'Bootstrap SQL Server Integration From Backup')
export class BootstrapSQLServerIntegrationFromBackupAction extends BaseIntegrationAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const startTime = Date.now();
        let stagingDbCreated = false;
        let stagingDbName = '';
        let containerUrl = '';
        let sqlExecutor: DatabaseProviderBase | undefined;

        try {
            // 1. Parameter Validation
            const companyIntegrationID = this.getStringParam(params, 'CompanyIntegrationID');
            if (!companyIntegrationID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: "Parameter 'CompanyIntegrationID' is required.",
                    Params: params.Params,
                };
            }

            const backupUrlsRaw = this.getStringParam(params, 'BackupUrls');
            if (!backupUrlsRaw) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: "Parameter 'BackupUrls' is required.",
                    Params: params.Params,
                };
            }

            const backupUrls = backupUrlsRaw.split(',').map(u => u.trim()).filter(u => u.length > 0);
            if (backupUrls.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_PARAMETER',
                    Message: "Parameter 'BackupUrls' must contain at least one valid URL or file path.",
                    Params: params.Params,
                };
            }

            stagingDbName = this.getStringParam(params, 'StagingDatabaseName') ??
                `MJ_Staging_${companyIntegrationID.replace(/[^a-zA-Z0-9]/g, '').substring(0, 12)}_${Date.now()}`;
            ValidateIdentifier(stagingDbName, 'database');

            const dropStagingOnComplete = this.getBoolParam(params, 'DropStagingDbOnComplete', true);
            const truncateTargetBeforeLoad = this.getBoolParam(params, 'TruncateTargetBeforeLoad', false);
            const batchSize = this.getNumberParam(params, 'BatchSize', 500000);
            const entityMapIDs = this.getStringListParam(params, 'EntityMapIDs');

            // 2. Resolve SQL Execution Provider (MultiProvider compliant)
            sqlExecutor = this.getDatabaseProvider(params);

            // 3. Resolve Azure Storage SAS Token & Credential if URL sources are used
            const hasUrl = backupUrls.some(u => this.IsUrl(u));
            if (hasUrl) {
                const sasToken = await this.resolveSasToken(params);
                const firstUrl = backupUrls.find(u => this.IsUrl(u))!;
                containerUrl = this.extractContainerUrl(firstUrl);

                // Create SQL Server Storage Credential
                LogStatus(`[BootstrapSQLServer] Ensuring credential for storage container '${containerUrl}'...`);
                await this.ensureStorageCredential(sqlExecutor, containerUrl, sasToken, params.ContextUser);
            }

            // 4. Inspect Backup Header & Filelist across ALL stripes (Msg 3132 prevention)
            LogStatus(`[BootstrapSQLServer] Reading backup header from ${backupUrls.length} stripe(s)...`);
            const headerInfo = await this.inspectBackupHeader(sqlExecutor, backupUrls, params.ContextUser);
            LogStatus(`[BootstrapSQLServer] Backup Header: SourceDB='${headerInfo.DatabaseName}', BackupStartDate=${headerInfo.BackupStartDate.toISOString()}`);

            const fileList = await this.inspectBackupFileList(sqlExecutor, backupUrls, params.ContextUser);
            const moveClauses = await this.buildMoveClauses(sqlExecutor, stagingDbName, fileList, params);

            // 5. Direct Restore Database from Backup File(s) or Blob Storage URL(s)
            LogStatus(`[BootstrapSQLServer] Restoring staging database [${stagingDbName}] from ${backupUrls.length} backup source(s)...`);
            await this.executeDatabaseRestore(sqlExecutor, stagingDbName, backupUrls, moveClauses, params.ContextUser);
            stagingDbCreated = true;

            // 6. Load Active Entity Maps for Company Integration
            const entityMaps = await this.loadEntityMaps(sqlExecutor, companyIntegrationID, entityMapIDs, params.ContextUser);
            if (entityMaps.length === 0) {
                LogStatus(`[BootstrapSQLServer] Warning: No active entity maps found for CompanyIntegrationID=${companyIntegrationID}.`);
            }

            // 7. Execute Local In-Engine Minimally-Logged ETL
            let totalRowsInserted = 0;
            const tableResults: TableEtlResult[] = [];

            for (const map of entityMaps) {
                const entityInfo = sqlExecutor.EntityByID(map.EntityID);
                if (!entityInfo) {
                    LogError(`[BootstrapSQLServer] Skipping EntityMap ${map.ID}: Target EntityID '${map.EntityID}' not found in metadata.`);
                    continue;
                }

                // Check AllowDirectSQLInsert on target entity before direct DML (Task 7)
                if (!entityInfo.AllowDirectSQLInsert) {
                    throw new Error(`Target entity '${entityInfo.Name}' does not have AllowDirectSQLInsert enabled. Direct SQL ETL is prohibited.`);
                }

                const targetPkCol = entityInfo.FirstPrimaryKey?.Name ?? 'ID';

                const result = await this.executeTableEtl(
                    sqlExecutor,
                    companyIntegrationID,
                    map,
                    stagingDbName,
                    map.ExternalObjectName,
                    entityInfo.SchemaName,
                    entityInfo.BaseTable,
                    targetPkCol,
                    batchSize,
                    headerInfo.BackupStartDate,
                    truncateTargetBeforeLoad,
                    params.ContextUser
                );

                // After successful table load and commit, invalidate RunView server cache for the entity (Task 7)
                await LocalCacheManager.Instance.InvalidateEntityCaches(entityInfo.Name);

                totalRowsInserted += result.RowsTransferred;
                tableResults.push(result);
            }

            // 8. Seed Watermark via WatermarkService (Zero-Gap Invariant)
            LogStatus(`[BootstrapSQLServer] Seeding sync watermarks with BackupStartDate: ${headerInfo.BackupStartDate.toISOString()}...`);
            const watermarkService = new WatermarkService();
            for (const map of entityMaps) {
                await watermarkService.Update(
                    map.ID,
                    headerInfo.BackupStartDate.toISOString(),
                    params.ContextUser,
                    'Pull'
                );
            }

            // 9. Post-Restore Cleanup
            if (dropStagingOnComplete) {
                LogStatus(`[BootstrapSQLServer] Cleaning up staging database [${stagingDbName}]...`);
                await this.dropStagingDatabase(sqlExecutor, stagingDbName, params.ContextUser);
                stagingDbCreated = false;

                if (containerUrl) {
                    LogStatus(`[BootstrapSQLServer] Cleaning up storage credential '${containerUrl}'...`);
                    await this.dropStorageCredential(sqlExecutor, containerUrl, params.ContextUser);
                }
            }

            const durationSec = Math.round((Date.now() - startTime) / 1000);
            this.addOutputParam(params, 'BackupStartDate', headerInfo.BackupStartDate.toISOString());
            this.addOutputParam(params, 'StagingDatabaseName', stagingDbName);
            this.addOutputParam(params, 'TablesProcessed', tableResults.length);
            this.addOutputParam(params, 'TotalRowsTransferred', totalRowsInserted);
            this.addOutputParam(params, 'DurationSeconds', durationSec);
            this.addOutputParam(params, 'StagingDatabaseDropped', dropStagingOnComplete ? 1 : 0);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully bootstrapped ${tableResults.length} table(s) (${totalRowsInserted.toLocaleString()} rows) in ${durationSec}s. Watermark seeded to ${headerInfo.BackupStartDate.toISOString()}.`,
                Params: params.Params,
            };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`[BootstrapSQLServerIntegrationFromBackupAction] Failure: ${message}`);

            // Automated fail-safe cleanup if failure occurred after staging database creation
            if (stagingDbCreated && stagingDbName && sqlExecutor) {
                try {
                    await this.dropStagingDatabase(sqlExecutor, stagingDbName, params.ContextUser);
                    if (containerUrl) {
                        await this.dropStorageCredential(sqlExecutor, containerUrl, params.ContextUser);
                    }
                } catch (cleanupErr) {
                    LogError(`[BootstrapSQLServerIntegrationFromBackupAction] Post-failure cleanup failed: ${cleanupErr}`);
                }
            }

            return {
                Success: false,
                ResultCode: 'BOOTSTRAP_FAILED',
                Message: message,
                Params: params.Params,
            };
        }
    }

    /**
     * Backward-compatible helper method to inspect backup header.
     */
    public async readBackupHeader(
        executor: DatabaseProviderBase,
        backupUrl: string,
        contextUser?: UserInfo
    ): Promise<SqlBackupHeaderInfo> {
        return this.inspectBackupHeader(executor, [backupUrl], contextUser);
    }

    /**
     * Backward-compatible helper method to inspect backup file list.
     */
    public async readBackupFileList(
        executor: DatabaseProviderBase,
        backupUrl: string,
        contextUser?: UserInfo
    ): Promise<SqlBackupFileListEntry[]> {
        return this.inspectBackupFileList(executor, [backupUrl], contextUser);
    }

    /**
     * Constructs the MOVE clauses for data and log files.
     */
    protected async buildMoveClauses(
        executor: DatabaseProviderBase,
        stagingDbName: string,
        fileList: SqlBackupFileListEntry[],
        params: RunActionParams
    ): Promise<string[]> {
        let customDataDir = this.getStringParam(params, 'TargetDataFileDirectory');
        let customLogDir = this.getStringParam(params, 'TargetLogFileDirectory');

        if (!customDataDir || !customLogDir) {
            const defaultPaths = await this.queryInstanceDefaultPaths(executor, params.ContextUser);
            if (!customDataDir) customDataDir = defaultPaths.DataPath;
            if (!customLogDir) customLogDir = defaultPaths.LogPath;
        }

        // Normalize trailing slashes
        const dataDir = customDataDir.replace(/[\\/]+$/, '');
        const logDir = customLogDir.replace(/[\\/]+$/, '');

        let dataCount = 0;
        let logCount = 0;

        return fileList.map((entry) => {
            const cleanLogical = EscapeSQLString(entry.LogicalName);
            if (entry.Type === 'L') {
                const suffix = logCount === 0 ? '' : `_${logCount}`;
                logCount++;
                const targetPath = `${logDir}\\${stagingDbName}_log${suffix}.ldf`;
                return `MOVE N'${cleanLogical}' TO N'${EscapeSQLString(targetPath)}'`;
            } else {
                const ext = dataCount === 0 ? '.mdf' : '.ndf';
                const suffix = dataCount === 0 ? '' : `_${dataCount}`;
                dataCount++;
                const targetPath = `${dataDir}\\${stagingDbName}_data${suffix}${ext}`;
                return `MOVE N'${cleanLogical}' TO N'${EscapeSQLString(targetPath)}'`;
            }
        });
    }

    /**
     * Resolves default SQL Server instance paths for data and log files.
     */
    protected async queryInstanceDefaultPaths(
        executor: DatabaseProviderBase,
        contextUser?: UserInfo
    ): Promise<{ DataPath: string; LogPath: string }> {
        try {
            const sql = `
SELECT 
    COALESCE(
        CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS NVARCHAR(512)),
        (SELECT SUBSTRING(physical_name, 1, LEN(physical_name) - CHARINDEX('\\', REVERSE(physical_name))) 
         FROM sys.master_files WHERE database_id = 1 AND file_id = 1),
        'C:\\Program Files\\Microsoft SQL Server\\MSSQL\\DATA'
    ) AS DataPath,
    COALESCE(
        CAST(SERVERPROPERTY('InstanceDefaultLogPath') AS NVARCHAR(512)),
        (SELECT SUBSTRING(physical_name, 1, LEN(physical_name) - CHARINDEX('\\', REVERSE(physical_name))) 
         FROM sys.master_files WHERE database_id = 1 AND file_id = 2),
        'C:\\Program Files\\Microsoft SQL Server\\MSSQL\\DATA'
    ) AS LogPath;`;
            const rows = await executor.ExecuteSQL<{ DataPath: string; LogPath: string }>(
                sql,
                undefined,
                { description: 'Query Instance Default Paths' },
                contextUser
            );
            if (rows && rows.length > 0) {
                return {
                    DataPath: rows[0].DataPath,
                    LogPath: rows[0].LogPath,
                };
            }
        } catch (err) {
            LogError(`[BootstrapSQLServer] Could not query instance default paths: ${err}`);
        }

        return {
            DataPath: 'C:\\Program Files\\Microsoft SQL Server\\MSSQL\\DATA',
            LogPath: 'C:\\Program Files\\Microsoft SQL Server\\MSSQL\\DATA',
        };
    }

    /**
     * Executes the RESTORE DATABASE command formatting each stripe as URL = N'...' or DISK = N'...'.
     */
    protected async executeDatabaseRestore(
        executor: DatabaseProviderBase,
        stagingDbName: string,
        backupUrls: string[],
        moveClauses: string[],
        contextUser?: UserInfo
    ): Promise<void> {
        ValidateIdentifier(stagingDbName, 'database');
        const fromSources = this.buildFromSourcesClause(backupUrls);
        const moves = moveClauses.join(',\n    ');

        const sql = `
RESTORE DATABASE [${stagingDbName}]
FROM 
    ${fromSources}
WITH 
    ${moves},
    REPLACE,
    RECOVERY,
    STATS = 10;`;

        await executor.ExecuteSQL(sql, undefined, { isMutation: true, description: `RESTORE DATABASE [${stagingDbName}]` }, contextUser);
    }

    /**
     * Drops the staging database cleanly.
     */
    protected async dropStagingDatabase(
        executor: DatabaseProviderBase,
        stagingDbName: string,
        contextUser?: UserInfo
    ): Promise<void> {
        ValidateIdentifier(stagingDbName, 'database');
        const cleanDbName = EscapeSQLString(stagingDbName);
        const sql = `
IF DB_ID(N'${cleanDbName}') IS NOT NULL
BEGIN
    ALTER DATABASE [${stagingDbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [${stagingDbName}];
END`;
        await executor.ExecuteSQL(sql, undefined, { isMutation: true, description: `DROP DATABASE [${stagingDbName}]` }, contextUser);
    }

    /**
     * Loads active CompanyIntegrationEntityMap records for the integration.
     */
    protected async loadEntityMaps(
        provider: DatabaseProviderBase,
        companyIntegrationID: string,
        filterEntityMapIDs: string[] | undefined,
        contextUser: UserInfo
    ): Promise<MJCompanyIntegrationEntityMapEntity[]> {
        const rv = RunView.FromMetadataProvider(provider);
        let filter = `CompanyIntegrationID='${EscapeSQLString(companyIntegrationID)}' AND SyncEnabled=1 AND SyncDirection IN ('Pull', 'Bidirectional')`;
        if (filterEntityMapIDs && filterEntityMapIDs.length > 0) {
            const idList = filterEntityMapIDs.map(id => `'${EscapeSQLString(id)}'`).join(',');
            filter += ` AND ID IN (${idList})`;
        }

        const result = await rv.RunView<MJCompanyIntegrationEntityMapEntity>({
            EntityName: 'MJ: Company Integration Entity Maps',
            ExtraFilter: filter,
            OrderBy: 'Priority ASC',
            ResultType: 'entity_object',
        }, contextUser);

        if (!result.Success) {
            throw new Error(`Failed to load EntityMaps for CompanyIntegrationID=${companyIntegrationID}: ${result.ErrorMessage}`);
        }

        return result.Results ?? [];
    }

    /**
     * Checks if a target table currently contains any rows.
     */
    protected async targetTableHasRows(
        executor: DatabaseProviderBase,
        schema: string,
        table: string,
        contextUser?: UserInfo
    ): Promise<boolean> {
        ValidateIdentifier(schema, 'schema');
        ValidateIdentifier(table, 'table');
        const sql = `SELECT TOP 1 1 AS HasRows FROM [${schema}].[${table}] WITH (NOLOCK);`;
        const rows = await executor.ExecuteSQL<{ HasRows: number }>(sql, undefined, { description: `Check if ${schema}.${table} has rows` }, contextUser);
        return rows != null && rows.length > 0;
    }

    /**
     * Truncates target table or falls back to DELETE if table has foreign key references.
     */
    protected async truncateOrDeleteTargetTable(
        executor: DatabaseProviderBase,
        targetSchema: string,
        targetTable: string,
        contextUser?: UserInfo
    ): Promise<void> {
        ValidateIdentifier(targetSchema, 'schema');
        ValidateIdentifier(targetTable, 'table');
        try {
            await executor.ExecuteSQL(
                `TRUNCATE TABLE [${targetSchema}].[${targetTable}];`,
                undefined,
                { isMutation: true, description: `TRUNCATE TABLE [${targetSchema}].[${targetTable}]` },
                contextUser
            );
        } catch {
            await executor.ExecuteSQL(
                `DELETE FROM [${targetSchema}].[${targetTable}];`,
                undefined,
                { isMutation: true, description: `DELETE FROM [${targetSchema}].[${targetTable}]` },
                contextUser
            );
        }
    }

    /**
     * Clears existing record map rows for a specific CompanyIntegrationID and EntityID.
     */
    protected async clearRecordMapsForEntity(
        executor: DatabaseProviderBase,
        companyIntegrationID: string,
        entityID: string,
        contextUser?: UserInfo
    ): Promise<void> {
        const cleanCI = EscapeSQLString(companyIntegrationID);
        const cleanEntity = EscapeSQLString(entityID);
        const sql = `DELETE FROM __mj.[Company Integration Record Maps] WHERE CompanyIntegrationID = '${cleanCI}' AND EntityID = '${cleanEntity}';`;
        await executor.ExecuteSQL(sql, undefined, { isMutation: true, description: 'Clear Record Maps for Entity' }, contextUser);
    }

    /**
     * Resolves the watermark column for an entity map if configured.
     */
    protected resolveWatermarkColumn(
        entityMap: MJCompanyIntegrationEntityMapEntity,
        sourceColSet: Set<string>
    ): string | undefined {
        if (entityMap.Configuration) {
            try {
                const parsed = JSON.parse(entityMap.Configuration) as Record<string, unknown>;
                const fieldName = String(parsed.IncrementalWatermarkField ?? parsed.WatermarkField ?? '').trim();
                if (fieldName && sourceColSet.has(fieldName.toLowerCase())) {
                    return fieldName;
                }
            } catch {
                // Ignore JSON parse errors in Configuration
            }
        }
        return undefined;
    }

    /**
     * Executes the local set-based minimally-logged ETL for a single entity table wrapped in its own transaction.
     */
    protected async executeTableEtl(
        executor: DatabaseProviderBase,
        companyIntegrationID: string,
        entityMap: MJCompanyIntegrationEntityMapEntity,
        stagingDbName: string,
        externalObjectName: string,
        targetSchema: string,
        targetTable: string,
        targetPkCol: string,
        batchSize: number,
        restoreTimestamp: Date,
        truncateTargetBeforeLoad: boolean,
        contextUser?: UserInfo
    ): Promise<TableEtlResult> {
        const { schema: sourceSchema, table: sourceTable } = this.parseObjectIdentifier(externalObjectName);
        ValidateIdentifier(stagingDbName, 'database');
        ValidateIdentifier(sourceSchema, 'schema');
        ValidateIdentifier(sourceTable, 'table');
        ValidateIdentifier(targetSchema, 'schema');
        ValidateIdentifier(targetTable, 'table');
        ValidateIdentifier(targetPkCol, 'column');

        // Query source column list
        const sourceColumns = await this.queryTableColumns(executor, stagingDbName, sourceSchema, sourceTable, contextUser);
        if (sourceColumns.length === 0) {
            throw new Error(`Source table '[${stagingDbName}].[${sourceSchema}].[${sourceTable}]' does not exist or has no columns.`);
        }

        // Query target column list
        const targetColumns = await this.queryTableColumns(executor, undefined, targetSchema, targetTable, contextUser);
        if (targetColumns.length === 0) {
            throw new Error(`Target table '[${targetSchema}].[${targetTable}]' does not exist in target database.`);
        }

        const sourceColSet = new Set(sourceColumns.map(c => c.COLUMN_NAME.toLowerCase()));
        const targetColMap = new Map(targetColumns.map(c => [c.COLUMN_NAME.toLowerCase(), c.COLUMN_NAME]));

        // Determine source primary key column(s)
        const pkColumns = await this.queryPrimaryKeyColumns(executor, stagingDbName, sourceSchema, sourceTable, contextUser);
        pkColumns.forEach(c => ValidateIdentifier(c, 'column'));

        const pkExpression = pkColumns.length > 0
            ? pkColumns.map(c => `ISNULL(CAST(s.[${c}] AS NVARCHAR(450)), N'')`).join(" + ':' + ")
            : (sourceColSet.has('id') ? `CAST(s.[id] AS NVARCHAR(450))` : `CAST(NEWID() AS NVARCHAR(450))`);

        // Check re-run safety & target rows
        const hasRows = await this.targetTableHasRows(executor, targetSchema, targetTable, contextUser);
        if (hasRows && !truncateTargetBeforeLoad) {
            throw new Error(`Target table '[${targetSchema}].[${targetTable}]' already contains data and 'TruncateTargetBeforeLoad' is false. Set TruncateTargetBeforeLoad to 'true' to allow replacing existing data, or clear target table before running.`);
        }

        // Resolve optional watermark column
        const watermarkSourceCol = this.resolveWatermarkColumn(entityMap, sourceColSet);

        // Build column projections
        const insertCols: string[] = [];
        const selectCols: string[] = [];

        // Target primary key - use NEWID() (Task 3: NEWSEQUENTIALID rejected in SELECT)
        if (targetColMap.has(targetPkCol.toLowerCase())) {
            insertCols.push(`[${targetColMap.get(targetPkCol.toLowerCase())}]`);
            selectCols.push(`NEWID()`);
        }

        // Standard integration columns (Task 11: Remove SourceRecordID, SourceObject, SyncedAt)
        if (targetColMap.has('__mj_integration_syncstatus')) {
            insertCols.push(`[${targetColMap.get('__mj_integration_syncstatus')}]`);
            selectCols.push(`N'Active'`);
        }
        if (targetColMap.has('__mj_integration_lastsyncedat')) {
            insertCols.push(`[${targetColMap.get('__mj_integration_lastsyncedat')}]`);
            selectCols.push(`@RestoreTimestamp`);
        }
        if (targetColMap.has('__mj_integration_lastseenmodifiedvalue') && watermarkSourceCol) {
            insertCols.push(`[${targetColMap.get('__mj_integration_lastseenmodifiedvalue')}]`);
            selectCols.push(`CAST(s.[${watermarkSourceCol}] AS NVARCHAR(255))`);
        }

        // Standard domain columns (intersection of source and target)
        for (const sCol of sourceColumns) {
            const sNameLower = sCol.COLUMN_NAME.toLowerCase();
            // Skip target PK and synthetic integration columns
            if (
                sNameLower === targetPkCol.toLowerCase() ||
                sNameLower === 'sourcerecordid' ||
                sNameLower === 'sourceobject' ||
                sNameLower === 'syncedat' ||
                sNameLower === '__mj_integration_syncstatus' ||
                sNameLower === '__mj_integration_lastsyncedat' ||
                sNameLower === '__mj_integration_lastseenmodifiedvalue'
            ) {
                continue;
            }
            if (targetColMap.has(sNameLower)) {
                const targetExactName = targetColMap.get(sNameLower)!;
                ValidateIdentifier(targetExactName, 'column');
                ValidateIdentifier(sCol.COLUMN_NAME, 'column');
                insertCols.push(`[${targetExactName}]`);
                selectCols.push(`s.[${sCol.COLUMN_NAME}]`);
            }
        }

        // Query source row count
        const totalRows = await this.queryTableRowCount(executor, stagingDbName, sourceSchema, sourceTable, contextUser);
        const isoTimestamp = restoreTimestamp.toISOString();

        // Determine if chunking is eligible (Task 5: Gate chunked transfer on single-column integer PK)
        let isIntegerPk = false;
        if (pkColumns.length === 1) {
            const pkColInfo = sourceColumns.find(c => c.COLUMN_NAME.toLowerCase() === pkColumns[0].toLowerCase());
            if (pkColInfo) {
                const dt = pkColInfo.DATA_TYPE.toLowerCase();
                isIntegerPk = ['tinyint', 'smallint', 'int', 'bigint'].includes(dt);
            }
        }
        const useChunked = batchSize > 0 && totalRows > batchSize && pkColumns.length === 1 && isIntegerPk;

        // Build join predicate for SEED RECORD MAPS (Task 11)
        const joinPredicates = pkColumns.length > 0
            ? pkColumns.map(col => {
                const targetCol = targetColMap.get(col.toLowerCase()) ?? col;
                return `t.[${targetCol}] = s.[${col}]`;
            }).join(' AND ')
            : `t.[${targetPkCol}] = s.[id]`;

        const cleanCI = EscapeSQLString(companyIntegrationID);
        const cleanEntityID = EscapeSQLString(entityMap.EntityID);

        const recordMapsInsertSql = `
INSERT INTO __mj.[Company Integration Record Maps]
(
    [ID],
    [CompanyIntegrationID],
    [EntityID],
    [ExternalSystemRecordID],
    [EntityRecordID],
    [__mj_CreatedAt],
    [__mj_UpdatedAt]
)
SELECT 
    NEWID(),
    '${cleanCI}',
    '${cleanEntityID}',
    (${pkExpression}),
    CAST(t.[${targetPkCol}] AS NVARCHAR(750)),
    GETUTCDATE(),
    GETUTCDATE()
FROM [${targetSchema}].[${targetTable}] t WITH (NOLOCK)
INNER JOIN [${stagingDbName}].[${sourceSchema}].[${sourceTable}] s WITH (NOLOCK)
    ON ${joinPredicates};`;

        // Wrap each entity map load in its own transaction (Task 6)
        await executor.ExecuteSQL('BEGIN TRANSACTION;', undefined, { isMutation: true, description: `BEGIN TRANSACTION ${sourceTable}` }, contextUser);

        try {
            if (truncateTargetBeforeLoad && hasRows) {
                await this.truncateOrDeleteTargetTable(executor, targetSchema, targetTable, contextUser);
                await this.clearRecordMapsForEntity(executor, companyIntegrationID, entityMap.EntityID, contextUser);
            }

            if (!useChunked) {
                // Single set-based insert
                const sql = `
DECLARE @RestoreTimestamp DATETIMEOFFSET = '${EscapeSQLString(isoTimestamp)}';
INSERT INTO [${targetSchema}].[${targetTable}] WITH (TABLOCK)
(
    ${insertCols.join(',\n    ')}
)
SELECT 
    ${selectCols.join(',\n    ')}
FROM [${stagingDbName}].[${sourceSchema}].[${sourceTable}] s WITH (NOLOCK);`;

                await executor.ExecuteSQL(sql, undefined, { isMutation: true, description: `ETL Transfer ${sourceTable} -> ${targetTable}` }, contextUser);
            } else {
                // Chunked batched insert using primary key range
                const pkCol = pkColumns[0];
                const sql = `
DECLARE @RestoreTimestamp DATETIMEOFFSET = '${EscapeSQLString(isoTimestamp)}';
DECLARE @MinID BIGINT = (SELECT ISNULL(MIN([${pkCol}]), 0) FROM [${stagingDbName}].[${sourceSchema}].[${sourceTable}]);
DECLARE @MaxID BIGINT = (SELECT ISNULL(MAX([${pkCol}]), 0) FROM [${stagingDbName}].[${sourceSchema}].[${sourceTable}]);
DECLARE @CurrentID BIGINT = @MinID;
DECLARE @ChunkSize BIGINT = ${batchSize};

WHILE @CurrentID <= @MaxID
BEGIN
    INSERT INTO [${targetSchema}].[${targetTable}] WITH (TABLOCK)
    (
        ${insertCols.join(',\n        ')}
    )
    SELECT 
        ${selectCols.join(',\n        ')}
    FROM [${stagingDbName}].[${sourceSchema}].[${sourceTable}] s WITH (NOLOCK)
    WHERE s.[${pkCol}] >= @CurrentID AND s.[${pkCol}] < @CurrentID + @ChunkSize;

    SET @CurrentID = @CurrentID + @ChunkSize;
END`;

                await executor.ExecuteSQL(sql, undefined, { isMutation: true, description: `Chunked ETL Transfer ${sourceTable} -> ${targetTable}` }, contextUser);
            }

            // Seed record maps in the same transaction (Task 11)
            await executor.ExecuteSQL(recordMapsInsertSql, undefined, { isMutation: true, description: `Seed Record Maps ${sourceTable} -> ${targetTable}` }, contextUser);

            await executor.ExecuteSQL('COMMIT TRANSACTION;', undefined, { isMutation: true, description: `COMMIT TRANSACTION ${sourceTable}` }, contextUser);

        } catch (txErr) {
            try {
                await executor.ExecuteSQL('IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;', undefined, { isMutation: true, description: `ROLLBACK TRANSACTION ${sourceTable}` }, contextUser);
            } catch (rbErr) {
                LogError(`[BootstrapSQLServer] Rollback failed for ${sourceTable}: ${rbErr}`);
            }
            throw txErr;
        }

        // Verify target row count
        const targetCount = await this.queryTableRowCount(executor, undefined, targetSchema, targetTable, contextUser);
        LogStatus(`[BootstrapSQLServer] Transferred ${sourceTable} -> ${targetTable}: ${targetCount.toLocaleString()} rows.`);

        return {
            SourceTable: `[${sourceSchema}].[${sourceTable}]`,
            TargetTable: `[${targetSchema}].[${targetTable}]`,
            RowsTransferred: targetCount,
        };
    }

    /**
     * Queries column metadata from INFORMATION_SCHEMA.COLUMNS.
     */
    protected async queryTableColumns(
        executor: DatabaseProviderBase,
        databaseName: string | undefined,
        schema: string,
        table: string,
        contextUser?: UserInfo
    ): Promise<SqlColumnInfo[]> {
        if (databaseName) ValidateIdentifier(databaseName, 'database');
        ValidateIdentifier(schema, 'schema');
        ValidateIdentifier(table, 'table');

        const dbPrefix = databaseName ? `[${databaseName}].` : '';
        const sql = `
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM ${dbPrefix}INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = N'${EscapeSQLString(schema)}' AND TABLE_NAME = N'${EscapeSQLString(table)}'
ORDER BY ORDINAL_POSITION;`;

        return await executor.ExecuteSQL<SqlColumnInfo>(
            sql,
            undefined,
            { description: `Query Columns for ${schema}.${table}` },
            contextUser
        );
    }

    /**
     * Queries the primary key column names of a table.
     */
    protected async queryPrimaryKeyColumns(
        executor: DatabaseProviderBase,
        databaseName: string,
        schema: string,
        table: string,
        contextUser?: UserInfo
    ): Promise<string[]> {
        ValidateIdentifier(databaseName, 'database');
        ValidateIdentifier(schema, 'schema');
        ValidateIdentifier(table, 'table');

        const dbPrefix = `[${databaseName}].`;
        const sql = `
SELECT col.COLUMN_NAME
FROM ${dbPrefix}INFORMATION_SCHEMA.TABLE_CONSTRAINTS pk
INNER JOIN ${dbPrefix}INFORMATION_SCHEMA.KEY_COLUMN_USAGE col
    ON pk.TABLE_NAME = col.TABLE_NAME 
    AND pk.TABLE_SCHEMA = col.TABLE_SCHEMA 
    AND pk.CONSTRAINT_NAME = col.CONSTRAINT_NAME
WHERE pk.CONSTRAINT_TYPE = 'PRIMARY KEY'
    AND pk.TABLE_SCHEMA = N'${EscapeSQLString(schema)}'
    AND pk.TABLE_NAME = N'${EscapeSQLString(table)}'
ORDER BY col.ORDINAL_POSITION;`;

        const rows = await executor.ExecuteSQL<{ COLUMN_NAME: string }>(
            sql,
            undefined,
            { description: `Query PK Columns for ${schema}.${table}` },
            contextUser
        );
        return rows.map(r => r.COLUMN_NAME);
    }

    /**
     * Queries total row count from sys.partitions for rapid set estimation.
     */
    protected async queryTableRowCount(
        executor: DatabaseProviderBase,
        databaseName: string | undefined,
        schema: string,
        table: string,
        contextUser?: UserInfo
    ): Promise<number> {
        if (databaseName) ValidateIdentifier(databaseName, 'database');
        ValidateIdentifier(schema, 'schema');
        ValidateIdentifier(table, 'table');

        const dbPrefix = databaseName ? `[${databaseName}].` : '';
        const sql = `
SELECT ISNULL(SUM(p.rows), 0) AS TotalRows
FROM ${dbPrefix}sys.partitions p
INNER JOIN ${dbPrefix}sys.tables t ON p.object_id = t.object_id
INNER JOIN ${dbPrefix}sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = N'${EscapeSQLString(schema)}' 
    AND t.name = N'${EscapeSQLString(table)}' 
    AND p.index_id IN (0, 1);`;

        const rows = await executor.ExecuteSQL<{ TotalRows: number }>(
            sql,
            undefined,
            { description: `Query Row Count for ${schema}.${table}` },
            contextUser
        );
        return rows && rows.length > 0 ? Number(rows[0].TotalRows) : 0;
    }

    /**
     * Parses an object identifier into schema and table components.
     * e.g. "sales.Customer" -> { schema: "sales", table: "Customer" }
     * e.g. "Customer" -> { schema: "dbo", table: "Customer" }
     */
    protected parseObjectIdentifier(identifier: string): { schema: string; table: string } {
        const clean = identifier.replace(/[\[\]]/g, '').trim();
        const parts = clean.split('.');
        if (parts.length >= 2) {
            return { schema: parts[0], table: parts.slice(1).join('.') };
        }
        return { schema: 'dbo', table: clean };
    }
}
