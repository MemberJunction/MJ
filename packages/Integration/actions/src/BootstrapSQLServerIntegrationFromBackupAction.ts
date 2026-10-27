import { RegisterClass, EscapeSQLString } from '@memberjunction/global';
import { LogError, LogStatus, RunView, DatabaseProviderBase, LocalCacheManager, type EntityInfo, type UserInfo } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { WatermarkService } from '@memberjunction/integration-engine';
import { MJCompanyIntegrationEntityMapEntity } from '@memberjunction/core-entities';
import { ValidateIdentifier } from '@memberjunction/schema-engine';
import {
    BaseIntegrationAction,
    SqlBackupFileListEntry,
    SqlBackupHeaderInfo,
    type LongRunningSqlRunner
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

/** One target column of the load and the T-SQL expression (over the staging alias `s`) that fills it. */
interface ColumnMapping {
    Target: string;
    Expr: string;
}

/** Where record maps are written, resolved from metadata so the core schema and base table are never hardcoded. */
interface RecordMapTarget {
    /** Fully quoted `[schema].[table]` of the `MJ: Company Integration Record Maps` base table. */
    Table: string;
    AllowDirectSQLDelete: boolean;
}

/** Everything the per-table load batch needs; built once per entity map. */
interface TableLoadBatchSpec {
    StagingDbName: string;
    SourceSchema: string;
    SourceTable: string;
    TargetSchema: string;
    TargetTable: string;
    TargetPkCol: string;
    Mappings: ColumnMapping[];
    ExternalIdExpr: string;
    RestoreTimestampIso: string;
    ChunkPkCol?: string;
    BatchSize: number;
    TruncateTarget: boolean;
    RecordMaps: RecordMapTarget;
    CompanyIntegrationID: string;
    EntityID: string;
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
 *
 * The restore and the per-table loads run for hours on a multi-terabyte backup, so they execute on a
 * dedicated connection with no request timeout (see {@link BaseIntegrationAction.createLongRunningRunner})
 * rather than on the API's shared pool. Each table load is one T-SQL batch that opens, commits or rolls
 * back its own transaction, so the statements are guaranteed to share a connection.
 */
@RegisterClass(BaseAction, 'Bootstrap SQL Server Integration From Backup')
export class BootstrapSQLServerIntegrationFromBackupAction extends BaseIntegrationAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const startTime = Date.now();
        let stagingDbCreated = false;
        let stagingDbName = '';
        let containerUrl = '';
        let sqlExecutor: DatabaseProviderBase | undefined;
        let runner: LongRunningSqlRunner | undefined;

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
            const recordMaps = this.resolveRecordMapTarget(sqlExecutor);

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

            // 5. Restore into a staging database that must not already exist: a restore WITH REPLACE over
            //    a user-typed name could otherwise overwrite a live database.
            await this.assertStagingDatabaseAbsent(sqlExecutor, stagingDbName, params.ContextUser);
            runner = await this.createLongRunningRunner(sqlExecutor, params.ContextUser);
            LogStatus(`[BootstrapSQLServer] Restoring staging database [${stagingDbName}] from ${backupUrls.length} backup source(s)...`);
            stagingDbCreated = true;
            await this.executeDatabaseRestore(runner, stagingDbName, backupUrls, moveClauses);

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

                // Direct DML against an entity's base table is sanctioned only by the entity's own opt-in.
                if (!entityInfo.AllowDirectSQLInsert) {
                    throw new Error(`Target entity '${entityInfo.Name}' does not have AllowDirectSQLInsert enabled. Direct SQL ETL is prohibited.`);
                }

                const targetPkCol = this.resolveTargetPrimaryKey(entityInfo);

                const result = await this.executeTableEtl(
                    sqlExecutor,
                    runner,
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
                    recordMaps,
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
        } finally {
            if (runner) {
                await runner.Dispose();
            }
        }
    }

    /**
     * The target entity's single primary-key column. The load writes one generated key per row and the
     * record-map seed stores one key value per row, so a composite-key target cannot be bootstrapped here.
     */
    protected resolveTargetPrimaryKey(entityInfo: EntityInfo): string {
        if (entityInfo.PrimaryKeys.length !== 1) {
            throw new Error(`Target entity '${entityInfo.Name}' has a composite primary key (${entityInfo.PrimaryKeys.map(pk => pk.Name).join(', ')}); bootstrap requires a single-column key.`);
        }
        return entityInfo.FirstPrimaryKey.Name; // first-pk-ok: single-column key enforced on the line above
    }

    /**
     * Resolves where record maps are seeded from the `MJ: Company Integration Record Maps` entity so the
     * core schema name and base table come from metadata, and checks the entity sanctions direct SQL.
     */
    protected resolveRecordMapTarget(provider: DatabaseProviderBase): RecordMapTarget {
        const entity = provider.EntityByName('MJ: Company Integration Record Maps');
        if (!entity) {
            throw new Error("Entity 'MJ: Company Integration Record Maps' was not found in metadata.");
        }
        if (!entity.AllowDirectSQLInsert) {
            throw new Error(`Entity '${entity.Name}' does not have AllowDirectSQLInsert enabled. Direct SQL record-map seeding is prohibited.`);
        }
        ValidateIdentifier(entity.SchemaName, 'schema');
        ValidateIdentifier(entity.BaseTable, 'table');
        return {
            Table: `[${entity.SchemaName}].[${entity.BaseTable}]`,
            AllowDirectSQLDelete: entity.AllowDirectSQLDelete,
        };
    }

    /**
     * Refuses to restore over a database that already exists. `RESTORE ... WITH REPLACE` would silently
     * overwrite it, and a staging name is user-supplied.
     */
    protected async assertStagingDatabaseAbsent(
        executor: DatabaseProviderBase,
        stagingDbName: string,
        contextUser?: UserInfo
    ): Promise<void> {
        ValidateIdentifier(stagingDbName, 'database');
        const sql = `SELECT DB_ID(N'${EscapeSQLString(stagingDbName)}') AS DatabaseId;`;
        const rows = await executor.ExecuteSQL<{ DatabaseId: number | null }>(sql, undefined, { description: 'Check staging database is absent' }, contextUser);
        if (rows && rows.length > 0 && rows[0].DatabaseId != null) {
            throw new Error(`Database [${stagingDbName}] already exists on this instance. Choose an unused staging database name; the bootstrap never overwrites an existing database.`);
        }
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
     * Runs on the long-running connection: a multi-terabyte restore takes hours. Never `WITH REPLACE`;
     * {@link assertStagingDatabaseAbsent} has already established the name is free.
     */
    protected async executeDatabaseRestore(
        runner: LongRunningSqlRunner,
        stagingDbName: string,
        backupUrls: string[],
        moveClauses: string[]
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
    RECOVERY,
    STATS = 10;`;

        await runner.ExecuteSQL(sql, `RESTORE DATABASE [${stagingDbName}]`);
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
     * Loads one entity map's staging table into its target table and seeds the record maps that let the
     * engine match later deltas to the bootstrapped rows. Metadata lookups run on the provider; the load
     * itself is a single T-SQL batch on the long-running connection (see {@link buildTableLoadBatch}).
     */
    protected async executeTableEtl(
        executor: DatabaseProviderBase,
        runner: LongRunningSqlRunner,
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
        recordMaps: RecordMapTarget,
        contextUser?: UserInfo
    ): Promise<TableEtlResult> {
        const { schema: sourceSchema, table: sourceTable } = this.parseObjectIdentifier(externalObjectName);
        ValidateIdentifier(stagingDbName, 'database');
        ValidateIdentifier(sourceSchema, 'schema');
        ValidateIdentifier(sourceTable, 'table');
        ValidateIdentifier(targetSchema, 'schema');
        ValidateIdentifier(targetTable, 'table');
        ValidateIdentifier(targetPkCol, 'column');

        const sourceColumns = await this.queryTableColumns(executor, stagingDbName, sourceSchema, sourceTable, contextUser);
        if (sourceColumns.length === 0) {
            throw new Error(`Source table '[${stagingDbName}].[${sourceSchema}].[${sourceTable}]' does not exist or has no columns.`);
        }

        const targetColumns = await this.queryTableColumns(executor, undefined, targetSchema, targetTable, contextUser);
        if (targetColumns.length === 0) {
            throw new Error(`Target table '[${targetSchema}].[${targetTable}]' does not exist in target database.`);
        }

        const sourceColSet = new Set(sourceColumns.map(c => c.COLUMN_NAME.toLowerCase()));
        const targetColMap = new Map(targetColumns.map(c => [c.COLUMN_NAME.toLowerCase(), c.COLUMN_NAME]));

        const pkColumns = await this.queryPrimaryKeyColumns(executor, stagingDbName, sourceSchema, sourceTable, contextUser);
        pkColumns.forEach(c => ValidateIdentifier(c, 'column'));

        const hasRows = await this.targetTableHasRows(executor, targetSchema, targetTable, contextUser);
        if (hasRows && !truncateTargetBeforeLoad) {
            throw new Error(`Target table '[${targetSchema}].[${targetTable}]' already contains data and 'TruncateTargetBeforeLoad' is false. Set TruncateTargetBeforeLoad to 'true' to allow replacing existing data, or clear target table before running.`);
        }
        const truncateTarget = truncateTargetBeforeLoad && hasRows;
        if (truncateTarget && !recordMaps.AllowDirectSQLDelete) {
            throw new Error("Entity 'MJ: Company Integration Record Maps' does not have AllowDirectSQLDelete enabled, so existing record maps cannot be cleared for a re-run.");
        }

        const watermarkSourceCol = this.resolveWatermarkColumn(entityMap, sourceColSet);
        const mappings = this.buildColumnMappings(sourceColumns, targetColMap, targetPkCol, watermarkSourceCol);
        const totalRows = await this.queryTableRowCount(executor, stagingDbName, sourceSchema, sourceTable, contextUser);
        const chunkPkCol = this.resolveChunkColumn(pkColumns, sourceColumns, totalRows, batchSize);

        const batchSql = this.buildTableLoadBatch({
            StagingDbName: stagingDbName,
            SourceSchema: sourceSchema,
            SourceTable: sourceTable,
            TargetSchema: targetSchema,
            TargetTable: targetTable,
            TargetPkCol: targetPkCol,
            Mappings: mappings,
            ExternalIdExpr: this.buildExternalIdExpression(pkColumns, sourceColSet),
            RestoreTimestampIso: restoreTimestamp.toISOString(),
            ChunkPkCol: chunkPkCol,
            BatchSize: batchSize,
            TruncateTarget: truncateTarget,
            RecordMaps: recordMaps,
            CompanyIntegrationID: companyIntegrationID,
            EntityID: entityMap.EntityID,
        });

        const rows = await runner.ExecuteSQL<{ RowsInserted: number | string }>(batchSql, `ETL Transfer ${sourceTable} -> ${targetTable}`);
        const rowsInserted = rows && rows.length > 0 ? Number(rows[0].RowsInserted) : 0;
        LogStatus(`[BootstrapSQLServer] Transferred ${sourceTable} -> ${targetTable}: ${rowsInserted.toLocaleString()} rows.`);

        return {
            SourceTable: `[${sourceSchema}].[${sourceTable}]`,
            TargetTable: `[${targetSchema}].[${targetTable}]`,
            RowsTransferred: rowsInserted,
        };
    }

    /**
     * The columns the load writes: a generated target key, the engine's integration bookkeeping columns,
     * and every domain column present on both sides. Source columns that collide with the target key or the
     * bookkeeping columns are skipped — the key is generated and the bookkeeping is set here.
     */
    protected buildColumnMappings(
        sourceColumns: SqlColumnInfo[],
        targetColMap: Map<string, string>,
        targetPkCol: string,
        watermarkSourceCol: string | undefined
    ): ColumnMapping[] {
        const mappings: ColumnMapping[] = [];
        const targetPkLower = targetPkCol.toLowerCase();

        // Target primary key: NEWID() — NEWSEQUENTIALID() is only valid in a DEFAULT constraint (Msg 302).
        if (targetColMap.has(targetPkLower)) {
            mappings.push({ Target: targetColMap.get(targetPkLower)!, Expr: 'NEWID()' });
        }
        if (targetColMap.has('__mj_integration_syncstatus')) {
            mappings.push({ Target: targetColMap.get('__mj_integration_syncstatus')!, Expr: `N'Active'` });
        }
        if (targetColMap.has('__mj_integration_lastsyncedat')) {
            mappings.push({ Target: targetColMap.get('__mj_integration_lastsyncedat')!, Expr: '@RestoreTimestamp' });
        }
        if (targetColMap.has('__mj_integration_lastseenmodifiedvalue') && watermarkSourceCol) {
            mappings.push({ Target: targetColMap.get('__mj_integration_lastseenmodifiedvalue')!, Expr: `CAST(s.[${watermarkSourceCol}] AS NVARCHAR(255))` });
        }

        const reserved = new Set([targetPkLower, 'sourcerecordid', 'sourceobject', 'syncedat',
            '__mj_integration_syncstatus', '__mj_integration_lastsyncedat', '__mj_integration_lastseenmodifiedvalue']);
        for (const sCol of sourceColumns) {
            const sNameLower = sCol.COLUMN_NAME.toLowerCase();
            if (reserved.has(sNameLower) || !targetColMap.has(sNameLower)) {
                continue;
            }
            const targetExactName = targetColMap.get(sNameLower)!;
            ValidateIdentifier(targetExactName, 'column');
            ValidateIdentifier(sCol.COLUMN_NAME, 'column');
            mappings.push({ Target: targetExactName, Expr: `s.[${sCol.COLUMN_NAME}]` });
        }
        return mappings;
    }

    /**
     * The external record identity the engine will match deltas against: the source primary key, with the
     * parts of a composite key joined by `|` exactly as the external-data-source connector's `BuildRecord`
     * joins them. Falls back to a column named `id`, then to a random key for a key-less source.
     */
    protected buildExternalIdExpression(pkColumns: string[], sourceColSet: Set<string>): string {
        if (pkColumns.length > 0) {
            return pkColumns.map(c => `ISNULL(CAST(s.[${c}] AS NVARCHAR(450)), N'')`).join(" + N'|' + ");
        }
        return sourceColSet.has('id') ? `CAST(s.[id] AS NVARCHAR(450))` : `CAST(NEWID() AS NVARCHAR(450))`;
    }

    /** The key column to chunk a large load by, or undefined: only a single-column integer key qualifies. */
    protected resolveChunkColumn(pkColumns: string[], sourceColumns: SqlColumnInfo[], totalRows: number, batchSize: number): string | undefined {
        if (batchSize <= 0 || totalRows <= batchSize || pkColumns.length !== 1) {
            return undefined;
        }
        const pkColInfo = sourceColumns.find(c => c.COLUMN_NAME.toLowerCase() === pkColumns[0].toLowerCase());
        const isIntegerPk = pkColInfo ? ['tinyint', 'smallint', 'int', 'bigint'].includes(pkColInfo.DATA_TYPE.toLowerCase()) : false;
        return isIntegerPk ? pkColumns[0] : undefined;
    }

    /**
     * One T-SQL batch that loads a table and seeds its record maps atomically. Every statement runs on the
     * batch's connection, so `BEGIN TRANSACTION` / `COMMIT` are guaranteed to wrap the work (separate
     * `ExecuteSQL` calls each take whatever pooled connection is free). The MERGE's `OUTPUT ... INTO`
     * captures the generated target key next to the external key of the same source row, which is the
     * only way to build the record map: an `INSERT ... SELECT` cannot output source columns.
     */
    protected buildTableLoadBatch(spec: TableLoadBatchSpec): string {
        const stagingSource = `[${spec.StagingDbName}].[${spec.SourceSchema}].[${spec.SourceTable}]`;
        const load = spec.ChunkPkCol
            ? this.buildChunkedLoad(spec, stagingSource)
            : this.buildMergeStatement(spec, stagingSource, undefined);
        const preLoad = spec.TruncateTarget ? this.buildTruncateStatements(spec) : '';
        const cleanCI = EscapeSQLString(spec.CompanyIntegrationID);
        const cleanEntityID = EscapeSQLString(spec.EntityID);

        return `
SET XACT_ABORT ON;
SET NOCOUNT ON;
DECLARE @RestoreTimestamp DATETIMEOFFSET = '${EscapeSQLString(spec.RestoreTimestampIso)}';
CREATE TABLE #MJRecordMap ([EntityRecordID] NVARCHAR(750) NOT NULL, [ExternalSystemRecordID] NVARCHAR(750) NOT NULL);
BEGIN TRY
    BEGIN TRANSACTION;
${preLoad}${load}
    INSERT INTO ${spec.RecordMaps.Table}
    (
        [ID],
        [CompanyIntegrationID],
        [EntityID],
        [ExternalSystemRecordID],
        [EntityRecordID],
        [__mj_CreatedAt],
        [__mj_UpdatedAt]
    )
    SELECT NEWID(), '${cleanCI}', '${cleanEntityID}', m.[ExternalSystemRecordID], m.[EntityRecordID], GETUTCDATE(), GETUTCDATE()
    FROM #MJRecordMap m;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
SELECT COUNT_BIG(*) AS RowsInserted FROM #MJRecordMap;
DROP TABLE #MJRecordMap;`;
    }

    /** Clear the target table (DELETE when a foreign key blocks TRUNCATE) and its record maps for a re-run. */
    private buildTruncateStatements(spec: TableLoadBatchSpec): string {
        const target = `[${spec.TargetSchema}].[${spec.TargetTable}]`;
        const cleanCI = EscapeSQLString(spec.CompanyIntegrationID);
        const cleanEntityID = EscapeSQLString(spec.EntityID);
        return `    BEGIN TRY
        TRUNCATE TABLE ${target};
    END TRY
    BEGIN CATCH
        DELETE FROM ${target};
    END CATCH;
    DELETE FROM ${spec.RecordMaps.Table} WHERE CompanyIntegrationID = '${cleanCI}' AND EntityID = '${cleanEntityID}';
`;
    }

    /** The MERGE that inserts every staged row (optionally a key range) and records (target key, external key) pairs. */
    private buildMergeStatement(spec: TableLoadBatchSpec, stagingSource: string, whereClause: string | undefined): string {
        const projection = [`${spec.ExternalIdExpr} AS [__MJExternalID]`, ...spec.Mappings.map(m => `${m.Expr} AS [${m.Target}]`)].join(',\n            ');
        const insertCols = spec.Mappings.map(m => `[${m.Target}]`).join(', ');
        const insertVals = spec.Mappings.map(m => `src.[${m.Target}]`).join(', ');
        return `    MERGE INTO [${spec.TargetSchema}].[${spec.TargetTable}] WITH (TABLOCK) AS t
    USING (
        SELECT
            ${projection}
        FROM ${stagingSource} s WITH (NOLOCK)${whereClause ? `\n        WHERE ${whereClause}` : ''}
    ) AS src
    ON 1 = 0
    WHEN NOT MATCHED THEN
        INSERT (${insertCols})
        VALUES (${insertVals})
    OUTPUT CAST(inserted.[${spec.TargetPkCol}] AS NVARCHAR(750)), src.[__MJExternalID]
    INTO #MJRecordMap ([EntityRecordID], [ExternalSystemRecordID]);
`;
    }

    /** The chunked form of the load: the MERGE repeated over integer key ranges of `BatchSize`. */
    private buildChunkedLoad(spec: TableLoadBatchSpec, stagingSource: string): string {
        const pkCol = spec.ChunkPkCol!;
        const merge = this.buildMergeStatement(spec, stagingSource, `s.[${pkCol}] >= @CurrentID AND s.[${pkCol}] < @CurrentID + @ChunkSize`);
        return `    DECLARE @MinID BIGINT = (SELECT ISNULL(MIN([${pkCol}]), 0) FROM ${stagingSource});
    DECLARE @MaxID BIGINT = (SELECT ISNULL(MAX([${pkCol}]), 0) FROM ${stagingSource});
    DECLARE @CurrentID BIGINT = @MinID;
    DECLARE @ChunkSize BIGINT = ${Math.floor(spec.BatchSize)};
    WHILE @CurrentID <= @MaxID
    BEGIN
${merge}        SET @CurrentID = @CurrentID + @ChunkSize;
    END
`;
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
