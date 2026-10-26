import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus, Metadata, RunView, type UserInfo } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams, ActionParam } from '@memberjunction/actions-base';
import { CredentialEngine } from '@memberjunction/credentials';
import { WatermarkService } from '@memberjunction/integration-engine';
import { MJCompanyIntegrationEntityMapEntity } from '@memberjunction/core-entities';

/**
 * Interface representing a database execution provider that supports ExecuteSQL.
 */
export interface ISqlExecutor {
    ExecuteSQL<T = Record<string, unknown>>(
        sql: string,
        params?: unknown[],
        options?: { isMutation?: boolean; description?: string },
        contextUser?: UserInfo
    ): Promise<T[]>;
}

/**
 * Header information returned by SQL Server's RESTORE HEADERONLY statement.
 */
export interface SqlBackupHeaderInfo {
    BackupStartDate: Date;
    BackupFinishDate: Date;
    DatabaseName: string;
    FirstLSN?: string;
    LastLSN?: string;
    CheckpointLSN?: string;
}

/**
 * File list entry returned by SQL Server's RESTORE FILELISTONLY statement.
 */
export interface SqlBackupFileListEntry {
    LogicalName: string;
    PhysicalName: string;
    Type: 'D' | 'L';
}

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
export class BootstrapSQLServerIntegrationFromBackupAction extends BaseAction {

    /** Optional custom SQL executor override (primarily for unit tests and dependency injection). */
    private _customSqlExecutor?: ISqlExecutor;

    public set CustomSqlExecutor(executor: ISqlExecutor | undefined) {
        this._customSqlExecutor = executor;
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const startTime = Date.now();
        let stagingDbCreated = false;
        let stagingDbName = '';
        let containerUrl = '';

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
                    Message: "Parameter 'BackupUrls' must contain at least one valid URL.",
                    Params: params.Params,
                };
            }

            stagingDbName = this.getStringParam(params, 'StagingDatabaseName') ??
                `MJ_Staging_${companyIntegrationID.replace(/[^a-zA-Z0-9]/g, '').substring(0, 12)}_${Date.now()}`;
            const dropStagingOnComplete = this.getBooleanParam(params, 'DropStagingDbOnComplete', true);
            const batchSize = this.getNumberParam(params, 'BatchSize', 500000);
            const entityMapIDs = this.getStringListParam(params, 'EntityMapIDs');

            // 2. Resolve Azure Storage SAS Token
            const sasToken = await this.resolveSasToken(params);
            containerUrl = this.extractContainerUrl(backupUrls[0]);

            // 3. Resolve SQL Execution Provider
            const sqlExecutor = this.getSqlExecutor();

            // 4. Create SQL Server Storage Credential
            LogStatus(`[BootstrapSQLServer] Ensuring credential for storage container '${containerUrl}'...`);
            await this.ensureStorageCredential(sqlExecutor, containerUrl, sasToken, params.ContextUser);

            // 5. Inspect Backup Header & Filelist
            LogStatus(`[BootstrapSQLServer] Reading backup header from '${backupUrls[0]}'...`);
            const headerInfo = await this.readBackupHeader(sqlExecutor, backupUrls[0], params.ContextUser);
            LogStatus(`[BootstrapSQLServer] Backup Header: SourceDB='${headerInfo.DatabaseName}', BackupStartDate=${headerInfo.BackupStartDate.toISOString()}`);

            const fileList = await this.readBackupFileList(sqlExecutor, backupUrls[0], params.ContextUser);
            const moveClauses = await this.buildMoveClauses(sqlExecutor, stagingDbName, fileList, params);

            // 6. Direct Restore Database from Blob Storage URL
            LogStatus(`[BootstrapSQLServer] Restoring staging database [${stagingDbName}] from ${backupUrls.length} backup URL(s)...`);
            await this.restoreStagingDatabase(sqlExecutor, stagingDbName, backupUrls, moveClauses, params.ContextUser);
            stagingDbCreated = true;

            // 7. Load Active Entity Maps for Company Integration
            const entityMaps = await this.loadEntityMaps(companyIntegrationID, entityMapIDs, params.ContextUser);
            if (entityMaps.length === 0) {
                LogStatus(`[BootstrapSQLServer] Warning: No active entity maps found for CompanyIntegrationID=${companyIntegrationID}.`);
            }

            // 8. Execute Local In-Engine Minimally-Logged ETL
            let totalRowsInserted = 0;
            const tableResults: TableEtlResult[] = [];
            const md = new Metadata();

            for (const map of entityMaps) {
                const entityInfo = md.EntityByID(map.EntityID);
                if (!entityInfo) {
                    LogError(`[BootstrapSQLServer] Skipping EntityMap ${map.ID}: Target EntityID '${map.EntityID}' not found in metadata.`);
                    continue;
                }

                const result = await this.executeTableEtl(
                    sqlExecutor,
                    stagingDbName,
                    map.ExternalObjectName,
                    entityInfo.SchemaName,
                    entityInfo.BaseTable,
                    batchSize,
                    headerInfo.BackupStartDate,
                    params.ContextUser
                );

                totalRowsInserted += result.RowsTransferred;
                tableResults.push(result);
            }

            // 9. Seed Watermark via WatermarkService (Zero-Gap Invariant)
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

            // 10. Post-Restore Cleanup
            if (dropStagingOnComplete) {
                LogStatus(`[BootstrapSQLServer] Cleaning up staging database [${stagingDbName}]...`);
                await this.dropStagingDatabase(sqlExecutor, stagingDbName, params.ContextUser);
                stagingDbCreated = false;

                LogStatus(`[BootstrapSQLServer] Cleaning up storage credential '${containerUrl}'...`);
                await this.dropStorageCredential(sqlExecutor, containerUrl, params.ContextUser);
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
            if (stagingDbCreated && stagingDbName) {
                try {
                    const sqlExecutor = this.getSqlExecutor();
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
     * Resolves the Azure Blob SAS token either from direct parameter or through CredentialEngine.
     */
    protected async resolveSasToken(params: RunActionParams): Promise<string> {
        const directSas = this.getStringParam(params, 'SasToken');
        if (directSas) {
            return directSas.replace(/^\?/, '').trim();
        }

        const credId = this.getStringParam(params, 'StorageCredentialID');
        if (credId) {
            await CredentialEngine.Instance.Config(false, params.ContextUser);
            const credential = CredentialEngine.Instance.getCredentialById(credId);
            if (!credential) {
                throw new Error(`Credential with ID '${credId}' was not found in CredentialEngine.`);
            }

            const resolved = await CredentialEngine.Instance.GetCredential<Record<string, string>>(credential.Name, {
                contextUser: params.ContextUser,
            });

            const token = resolved.values?.SasToken || resolved.values?.Secret || resolved.values?.Key;
            if (!token) {
                throw new Error(`Credential '${credential.Name}' does not contain 'SasToken', 'Secret', or 'Key'.`);
            }
            return token.replace(/^\?/, '').trim();
        }

        throw new Error("Either 'SasToken' or 'StorageCredentialID' parameter must be provided.");
    }

    /**
     * Extracts the Azure Blob container root URL from a full blob URL.
     * e.g. 'https://myaccount.blob.core.windows.net/mycontainer/backup.bak' -> 'https://myaccount.blob.core.windows.net/mycontainer'
     */
    protected extractContainerUrl(blobUrl: string): string {
        const url = new URL(blobUrl);
        const segments = url.pathname.split('/').filter(s => s.length > 0);
        if (segments.length === 0) {
            throw new Error(`Invalid Azure Blob URL: '${blobUrl}'. Expected storage account and container path.`);
        }
        return `${url.origin}/${segments[0]}`;
    }

    /**
     * Ensures the SQL Server Database Scoped / Server Credential exists for the Azure Storage container URL.
     */
    protected async ensureStorageCredential(
        executor: ISqlExecutor,
        containerUrl: string,
        sasToken: string,
        contextUser?: UserInfo
    ): Promise<void> {
        const cleanSas = sasToken.replace(/'/g, "''");
        const cleanUrl = containerUrl.replace(/'/g, "''");
        const sql = `
IF NOT EXISTS (SELECT 1 FROM sys.credentials WHERE name = N'${cleanUrl}')
BEGIN
    CREATE CREDENTIAL [${cleanUrl}]
    WITH IDENTITY = 'SHARED ACCESS SIGNATURE',
    SECRET = N'${cleanSas}';
END`;
        await executor.ExecuteSQL(sql, undefined, { isMutation: true, description: 'Ensure Azure Storage Credential' }, contextUser);
    }

    /**
     * Drops the temporary SQL Server storage credential.
     */
    protected async dropStorageCredential(
        executor: ISqlExecutor,
        containerUrl: string,
        contextUser?: UserInfo
    ): Promise<void> {
        const cleanUrl = containerUrl.replace(/'/g, "''");
        const sql = `
IF EXISTS (SELECT 1 FROM sys.credentials WHERE name = N'${cleanUrl}')
BEGIN
    DROP CREDENTIAL [${cleanUrl}];
END`;
        await executor.ExecuteSQL(sql, undefined, { isMutation: true, description: 'Drop Azure Storage Credential' }, contextUser);
    }

    /**
     * Reads header metadata from the primary backup stripe using RESTORE HEADERONLY.
     */
    protected async readBackupHeader(
        executor: ISqlExecutor,
        backupUrl: string,
        contextUser?: UserInfo
    ): Promise<SqlBackupHeaderInfo> {
        const cleanUrl = backupUrl.replace(/'/g, "''");
        const sql = `RESTORE HEADERONLY FROM URL = N'${cleanUrl}';`;
        const rows = await executor.ExecuteSQL<Record<string, unknown>>(
            sql,
            undefined,
            { description: 'RESTORE HEADERONLY' },
            contextUser
        );

        if (!rows || rows.length === 0) {
            throw new Error(`RESTORE HEADERONLY returned no records for backup URL '${backupUrl}'.`);
        }

        const row = rows[0];
        const backupStartDateRaw = row.BackupStartDate;
        const backupFinishDateRaw = row.BackupFinishDate;
        const databaseName = typeof row.DatabaseName === 'string' ? row.DatabaseName : 'UnknownDatabase';

        const backupStartDate = backupStartDateRaw instanceof Date
            ? backupStartDateRaw
            : new Date(String(backupStartDateRaw));

        const backupFinishDate = backupFinishDateRaw instanceof Date
            ? backupFinishDateRaw
            : new Date(String(backupFinishDateRaw));

        if (isNaN(backupStartDate.getTime())) {
            throw new Error(`Failed to parse BackupStartDate from backup header: '${String(backupStartDateRaw)}'`);
        }

        return {
            BackupStartDate: backupStartDate,
            BackupFinishDate: isNaN(backupFinishDate.getTime()) ? backupStartDate : backupFinishDate,
            DatabaseName: databaseName,
            FirstLSN: row.FirstLSN != null ? String(row.FirstLSN) : undefined,
            LastLSN: row.LastLSN != null ? String(row.LastLSN) : undefined,
            CheckpointLSN: row.CheckpointLSN != null ? String(row.CheckpointLSN) : undefined,
        };
    }

    /**
     * Reads logical file metadata using RESTORE FILELISTONLY.
     */
    protected async readBackupFileList(
        executor: ISqlExecutor,
        backupUrl: string,
        contextUser?: UserInfo
    ): Promise<SqlBackupFileListEntry[]> {
        const cleanUrl = backupUrl.replace(/'/g, "''");
        const sql = `RESTORE FILELISTONLY FROM URL = N'${cleanUrl}';`;
        const rows = await executor.ExecuteSQL<Record<string, unknown>>(
            sql,
            undefined,
            { description: 'RESTORE FILELISTONLY' },
            contextUser
        );

        if (!rows || rows.length === 0) {
            throw new Error(`RESTORE FILELISTONLY returned no file records for backup URL '${backupUrl}'.`);
        }

        return rows.map(r => ({
            LogicalName: String(r.LogicalName),
            PhysicalName: String(r.PhysicalName),
            Type: String(r.Type).toUpperCase() === 'L' ? 'L' : 'D',
        }));
    }

    /**
     * Constructs the MOVE clauses for data and log files.
     */
    protected async buildMoveClauses(
        executor: ISqlExecutor,
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
            const cleanLogical = entry.LogicalName.replace(/'/g, "''");
            if (entry.Type === 'L') {
                const suffix = logCount === 0 ? '' : `_${logCount}`;
                logCount++;
                const targetPath = `${logDir}\\${stagingDbName}_log${suffix}.ldf`;
                return `MOVE N'${cleanLogical}' TO N'${targetPath.replace(/'/g, "''")}'`;
            } else {
                const ext = dataCount === 0 ? '.mdf' : '.ndf';
                const suffix = dataCount === 0 ? '' : `_${dataCount}`;
                dataCount++;
                const targetPath = `${dataDir}\\${stagingDbName}_data${suffix}${ext}`;
                return `MOVE N'${cleanLogical}' TO N'${targetPath.replace(/'/g, "''")}'`;
            }
        });
    }

    /**
     * Resolves default SQL Server instance paths for data and log files.
     */
    protected async queryInstanceDefaultPaths(
        executor: ISqlExecutor,
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
     * Restores the staging database from the Azure Blob URL(s).
     */
    protected async restoreStagingDatabase(
        executor: ISqlExecutor,
        stagingDbName: string,
        backupUrls: string[],
        moveClauses: string[],
        contextUser?: UserInfo
    ): Promise<void> {
        const cleanDbName = stagingDbName.replace(/[\[\]]/g, '');
        const fromUrls = backupUrls.map(u => `URL = N'${u.replace(/'/g, "''")}'`).join(',\n    ');
        const moves = moveClauses.join(',\n    ');

        const sql = `
RESTORE DATABASE [${cleanDbName}]
FROM 
    ${fromUrls}
WITH 
    ${moves},
    REPLACE,
    RECOVERY,
    STATS = 10;`;

        await executor.ExecuteSQL(sql, undefined, { isMutation: true, description: `RESTORE DATABASE [${cleanDbName}]` }, contextUser);
    }

    /**
     * Drops the staging database cleanly.
     */
    protected async dropStagingDatabase(
        executor: ISqlExecutor,
        stagingDbName: string,
        contextUser?: UserInfo
    ): Promise<void> {
        const cleanDbName = stagingDbName.replace(/[\[\]]/g, '');
        const sql = `
IF DB_ID(N'${cleanDbName.replace(/'/g, "''")}') IS NOT NULL
BEGIN
    ALTER DATABASE [${cleanDbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [${cleanDbName}];
END`;
        await executor.ExecuteSQL(sql, undefined, { isMutation: true, description: `DROP DATABASE [${cleanDbName}]` }, contextUser);
    }

    /**
     * Loads active CompanyIntegrationEntityMap records for the integration.
     */
    protected async loadEntityMaps(
        companyIntegrationID: string,
        filterEntityMapIDs: string[] | undefined,
        contextUser: UserInfo
    ): Promise<MJCompanyIntegrationEntityMapEntity[]> {
        const rv = new RunView();
        let filter = `CompanyIntegrationID='${companyIntegrationID.replace(/'/g, "''")}' AND SyncEnabled=1 AND SyncDirection IN ('Pull', 'Bidirectional')`;
        if (filterEntityMapIDs && filterEntityMapIDs.length > 0) {
            const idList = filterEntityMapIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
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
     * Executes the local set-based minimally-logged ETL for a single entity table.
     */
    protected async executeTableEtl(
        executor: ISqlExecutor,
        stagingDbName: string,
        externalObjectName: string,
        targetSchema: string,
        targetTable: string,
        batchSize: number,
        restoreTimestamp: Date,
        contextUser?: UserInfo
    ): Promise<TableEtlResult> {
        const { schema: sourceSchema, table: sourceTable } = this.parseObjectIdentifier(externalObjectName);
        const cleanStagingDb = stagingDbName.replace(/[\[\]]/g, '');

        // Query source column list
        const sourceColumns = await this.queryTableColumns(executor, cleanStagingDb, sourceSchema, sourceTable, contextUser);
        if (sourceColumns.length === 0) {
            throw new Error(`Source table '[${cleanStagingDb}].[${sourceSchema}].[${sourceTable}]' does not exist or has no columns.`);
        }

        // Query target column list
        const targetColumns = await this.queryTableColumns(executor, undefined, targetSchema, targetTable, contextUser);
        if (targetColumns.length === 0) {
            throw new Error(`Target table '[${targetSchema}].[${targetTable}]' does not exist in target database.`);
        }

        const sourceColSet = new Set(sourceColumns.map(c => c.COLUMN_NAME.toLowerCase()));
        const targetColMap = new Map(targetColumns.map(c => [c.COLUMN_NAME.toLowerCase(), c.COLUMN_NAME]));

        // Determine source primary key column(s)
        const pkColumns = await this.queryPrimaryKeyColumns(executor, cleanStagingDb, sourceSchema, sourceTable, contextUser);
        const pkExpression = pkColumns.length > 0
            ? pkColumns.map(c => `ISNULL(CAST(s.[${c}] AS NVARCHAR(450)), N'')`).join(" + ':' + ")
            : (sourceColSet.has('id') ? `CAST(s.[id] AS NVARCHAR(450))` : `CAST(NEWID() AS NVARCHAR(450))`);

        // Build column projections
        const insertCols: string[] = [];
        const selectCols: string[] = [];

        // Standard MJ columns
        if (targetColMap.has('id')) {
            insertCols.push(`[${targetColMap.get('id')}]`);
            selectCols.push(`NEWSEQUENTIALID()`);
        }
        if (targetColMap.has('sourcerecordid')) {
            insertCols.push(`[${targetColMap.get('sourcerecordid')}]`);
            selectCols.push(`(${pkExpression})`);
        }
        if (targetColMap.has('sourceobject')) {
            insertCols.push(`[${targetColMap.get('sourceobject')}]`);
            selectCols.push(`N'${sourceTable.replace(/'/g, "''")}'`);
        }
        if (targetColMap.has('syncedat')) {
            insertCols.push(`[${targetColMap.get('syncedat')}]`);
            selectCols.push(`@RestoreTimestamp`);
        }
        if (targetColMap.has('__mj_integration_syncstatus')) {
            insertCols.push(`[${targetColMap.get('__mj_integration_syncstatus')}]`);
            selectCols.push(`N'Active'`);
        }
        if (targetColMap.has('__mj_integration_lastsyncedat')) {
            insertCols.push(`[${targetColMap.get('__mj_integration_lastsyncedat')}]`);
            selectCols.push(`@RestoreTimestamp`);
        }

        // Standard domain columns (intersection of source and target)
        for (const sCol of sourceColumns) {
            const sNameLower = sCol.COLUMN_NAME.toLowerCase();
            // Skip already mapped synthetic columns
            if (sNameLower === 'id' || sNameLower === 'sourcerecordid' || sNameLower === 'sourceobject' || sNameLower === 'syncedat') {
                continue;
            }
            if (targetColMap.has(sNameLower)) {
                const targetExactName = targetColMap.get(sNameLower)!;
                insertCols.push(`[${targetExactName}]`);
                selectCols.push(`s.[${sCol.COLUMN_NAME}]`);
            }
        }

        // Query source row count
        const totalRows = await this.queryTableRowCount(executor, cleanStagingDb, sourceSchema, sourceTable, contextUser);
        const isoTimestamp = restoreTimestamp.toISOString();

        // Single set-based insert when unchunked or below batch threshold
        if (batchSize <= 0 || totalRows <= batchSize || pkColumns.length === 0) {
            const sql = `
DECLARE @RestoreTimestamp DATETIMEOFFSET = '${isoTimestamp}';
INSERT INTO [${targetSchema}].[${targetTable}] WITH (TABLOCK)
(
    ${insertCols.join(',\n    ')}
)
SELECT 
    ${selectCols.join(',\n    ')}
FROM [${cleanStagingDb}].[${sourceSchema}].[${sourceTable}] s WITH (NOLOCK);`;

            await executor.ExecuteSQL(sql, undefined, { isMutation: true, description: `ETL Transfer ${sourceTable} -> ${targetTable}` }, contextUser);
        } else {
            // Chunked batched insert using primary key range
            const pkCol = pkColumns[0];
            const sql = `
DECLARE @RestoreTimestamp DATETIMEOFFSET = '${isoTimestamp}';
DECLARE @MinID BIGINT = (SELECT ISNULL(MIN([${pkCol}]), 0) FROM [${cleanStagingDb}].[${sourceSchema}].[${sourceTable}]);
DECLARE @MaxID BIGINT = (SELECT ISNULL(MAX([${pkCol}]), 0) FROM [${cleanStagingDb}].[${sourceSchema}].[${sourceTable}]);
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
    FROM [${cleanStagingDb}].[${sourceSchema}].[${sourceTable}] s WITH (NOLOCK)
    WHERE s.[${pkCol}] >= @CurrentID AND s.[${pkCol}] < @CurrentID + @ChunkSize;

    SET @CurrentID = @CurrentID + @ChunkSize;
END`;

            await executor.ExecuteSQL(sql, undefined, { isMutation: true, description: `Chunked ETL Transfer ${sourceTable} -> ${targetTable}` }, contextUser);
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
        executor: ISqlExecutor,
        databaseName: string | undefined,
        schema: string,
        table: string,
        contextUser?: UserInfo
    ): Promise<SqlColumnInfo[]> {
        const dbPrefix = databaseName ? `[${databaseName.replace(/[\[\]]/g, '')}].` : '';
        const sql = `
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM ${dbPrefix}INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = N'${schema.replace(/'/g, "''")}' AND TABLE_NAME = N'${table.replace(/'/g, "''")}'
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
        executor: ISqlExecutor,
        databaseName: string,
        schema: string,
        table: string,
        contextUser?: UserInfo
    ): Promise<string[]> {
        const dbPrefix = `[${databaseName.replace(/[\[\]]/g, '')}].`;
        const sql = `
SELECT col.COLUMN_NAME
FROM ${dbPrefix}INFORMATION_SCHEMA.TABLE_CONSTRAINTS pk
INNER JOIN ${dbPrefix}INFORMATION_SCHEMA.KEY_COLUMN_USAGE col
    ON pk.TABLE_NAME = col.TABLE_NAME 
    AND pk.TABLE_SCHEMA = col.TABLE_SCHEMA 
    AND pk.CONSTRAINT_NAME = col.CONSTRAINT_NAME
WHERE pk.CONSTRAINT_TYPE = 'PRIMARY KEY'
    AND pk.TABLE_SCHEMA = N'${schema.replace(/'/g, "''")}'
    AND pk.TABLE_NAME = N'${table.replace(/'/g, "''")}'
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
        executor: ISqlExecutor,
        databaseName: string | undefined,
        schema: string,
        table: string,
        contextUser?: UserInfo
    ): Promise<number> {
        const dbPrefix = databaseName ? `[${databaseName.replace(/[\[\]]/g, '')}].` : '';
        const sql = `
SELECT ISNULL(SUM(p.rows), 0) AS TotalRows
FROM ${dbPrefix}sys.partitions p
INNER JOIN ${dbPrefix}sys.tables t ON p.object_id = t.object_id
INNER JOIN ${dbPrefix}sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = N'${schema.replace(/'/g, "''")}' 
    AND t.name = N'${table.replace(/'/g, "''")}' 
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

    /**
     * Obtains the active SQL Executor from custom injection or Metadata.Provider.
     */
    protected getSqlExecutor(): ISqlExecutor {
        if (this._customSqlExecutor) {
            return this._customSqlExecutor;
        }

        const provider = Metadata.Provider;
        if (provider && typeof (provider as Partial<ISqlExecutor>).ExecuteSQL === 'function') {
            return provider as unknown as ISqlExecutor;
        }

        throw new Error("No server-side database provider supporting 'ExecuteSQL' is available in Metadata.Provider.");
    }

    // ─── Parameter Accessor Helpers ─────────────────────────────────────

    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const nameLower = name.toLowerCase();
        const param = params.Params?.find(p => p.Name.trim().toLowerCase() === nameLower);
        if (!param || param.Value == null) return undefined;
        const value = String(param.Value).trim();
        return value.length > 0 ? value : undefined;
    }

    private getNumberParam(params: RunActionParams, name: string, defaultValue: number): number {
        const raw = this.getStringParam(params, name);
        if (raw == null) return defaultValue;
        const num = Number(raw);
        return isNaN(num) ? defaultValue : num;
    }

    private getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const raw = this.getStringParam(params, name);
        if (raw == null) return defaultValue;
        const lower = raw.toLowerCase();
        if (lower === 'true' || lower === '1') return true;
        if (lower === 'false' || lower === '0') return false;
        return defaultValue;
    }

    private getStringListParam(params: RunActionParams, name: string): string[] | undefined {
        const raw = this.getStringParam(params, name);
        if (!raw) return undefined;
        const list = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
        return list.length > 0 ? list : undefined;
    }

    private addOutputParam(params: RunActionParams, name: string, value: number | string | boolean): void {
        const outputParam = new ActionParam();
        outputParam.Name = name;
        outputParam.Type = 'Output';
        outputParam.Value = value;
        params.Params.push(outputParam);
    }
}
