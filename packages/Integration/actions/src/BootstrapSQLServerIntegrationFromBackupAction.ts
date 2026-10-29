import { RegisterClass, EscapeSQLString } from '@memberjunction/global';
import { LogError, LogStatus, RunView, DatabaseProviderBase, LocalCacheManager, type EntityInfo, type UserInfo } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { WatermarkService } from '@memberjunction/integration-engine';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { MJCompanyIntegrationEntityMapEntity } from '@memberjunction/core-entities';
import { ValidateIdentifier } from '@memberjunction/schema-engine';
import { IntegrationProgressEmitter } from '@memberjunction/integration-progress-artifacts';
import {
    BaseIntegrationAction,
    SqlBackupFileListEntry,
    SqlBackupHeaderInfo,
    TrimTrailingChars,
    type LongRunningSqlRunner
} from './BaseIntegrationAction.js';
import {
    AssertDropAllowedByFacts,
    AssertNotSystemDatabase,
    StagingDropRefusedError,
    type StagingDropFacts,
    type StagingDropOptions
} from './StagingDropGuard.js';
import { StagingNotAccessibleError, StagingNotAccessibleMessage } from './StagingAccessGuard.js';

/**
 * Reports the bootstrap's stages onto an integration run's progress artifact stream when the caller
 * launched it detached (the `ProgressRunID` input), and is a no-op otherwise. The stream is what a
 * client tails for hours while the restore and the loads run; the terminal `Summary` stage carries
 * the action's outputs so the client can read the outcome without the action result.
 */
export class BootstrapProgress {
    private readonly emitter?: IntegrationProgressEmitter;
    private currentStage = 'Prepare';

    constructor(runID: string | undefined, companyIntegrationID: string) {
        if (!runID) {
            return;
        }
        this.emitter = new IntegrationProgressEmitter({
            runID,
            runKind: 'Other',
            companyIntegrationID,
            triggerType: 'Manual',
            startedAt: new Date().toISOString(),
            context: { kind: 'SQLServerBackupBootstrap' },
        });
        // A run opened earlier (by a job that invokes this action as one phase) already has its start.
        if (!this.emitter.IsResumed) {
            this.emitter.RunStart('SQL Server backup bootstrap started');
        }
    }

    public StageStart(stage: string, message: string): void {
        this.currentStage = stage;
        this.emitter?.StageStart(stage, message);
    }

    public StageComplete(stage: string, rowsProcessed?: number): void {
        this.emitter?.StageComplete(stage, rowsProcessed === undefined ? undefined : { processed: rowsProcessed, succeeded: rowsProcessed });
    }

    public Heartbeat(message: string): void {
        this.emitter?.Heartbeat(this.currentStage, message);
    }

    /** The stage most recently started ('Prepare' before any). */
    public get CurrentStage(): string {
        return this.currentStage;
    }

    /** Reports a stage failure without terminating the run (for a phase whose job owns the run). */
    public StageError(stage: string, message: string, data?: Record<string, unknown>): void {
        this.emitter?.StageError(stage, message, data);
    }

    /** Terminate as success; the outputs ride on a final `Summary` stage event for the client. */
    public async Complete(message: string, outputs: Record<string, string | number | boolean>): Promise<void> {
        if (!this.emitter) {
            return;
        }
        this.emitter.Emit('stage.complete', { stage: 'Summary', message, data: outputs });
        await this.emitter.Complete(message);
    }

    /** Terminate as failure, attributing it to the stage that was running. */
    public async Fail(message: string): Promise<void> {
        if (!this.emitter) {
            return;
        }
        this.emitter.StageError(this.currentStage, message, { code: 'bootstrap-failed' });
        await this.emitter.Fail(message, 'bootstrap-failed');
    }

    /**
     * Waits until every queued event is written. A phase action calls this before returning so the
     * next writer that resumes the same run continues after everything this one emitted.
     */
    public async Flush(): Promise<void> {
        await this.emitter?.Flush();
    }
}

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
    /** The target entity's primary-key columns, in metadata order; the record map stores them `|`-joined. */
    TargetPkCols: string[];
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
 * State shared by the bootstrap's restore and load phases. The restore phase fills in the backup's
 * identity, the long-running runner and what it created (staging database, storage credential) as it
 * goes, so the caller's failure cleanup and runner disposal see exactly what exists.
 */
export interface BootstrapRunContext {
    Params: RunActionParams;
    Progress: BootstrapProgress;
    Executor: DatabaseProviderBase;
    Runner?: LongRunningSqlRunner;
    CompanyIntegrationID: string;
    StagingDatabaseName: string;
    /** Storage container whose SQL Server credential was registered; empty when every source is a local path. */
    ContainerUrl: string;
    /** True from the moment the restore starts until the staging database is dropped. */
    StagingDbCreated: boolean;
    BackupStartDate?: Date;
    BackupDatabaseName?: string;
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
 *   - ProgressRunID (optional): The integration progress run to report stages to, when launched detached
 *     by the `IntegrationStartBootstrap` mutation; the client tails that run instead of awaiting the action
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
        let ctx: BootstrapRunContext | undefined;
        // Opened before any validation so a detached caller sees even a parameter failure on its run.
        const progress = new BootstrapProgress(this.getStringParam(params, 'ProgressRunID'), this.getStringParam(params, 'CompanyIntegrationID') ?? '');

        try {
            // 1. Parameter Validation
            const companyIntegrationID = this.getStringParam(params, 'CompanyIntegrationID');
            if (!companyIntegrationID) {
                return await this.rejectInput(params, progress, 'MISSING_PARAMETER', "Parameter 'CompanyIntegrationID' is required.");
            }

            const backupUrlsRaw = this.getStringParam(params, 'BackupUrls');
            if (!backupUrlsRaw) {
                return await this.rejectInput(params, progress, 'MISSING_PARAMETER', "Parameter 'BackupUrls' is required.");
            }

            const backupUrls = backupUrlsRaw.split(',').map(u => u.trim()).filter(u => u.length > 0);
            if (backupUrls.length === 0) {
                return await this.rejectInput(params, progress, 'INVALID_PARAMETER', "Parameter 'BackupUrls' must contain at least one valid URL or file path.");
            }

            const stagingDbName = this.getStringParam(params, 'StagingDatabaseName') ??
                `MJ_Staging_${companyIntegrationID.replace(/[^a-zA-Z0-9]/g, '').substring(0, 12)}_${Date.now()}`;
            ValidateIdentifier(stagingDbName, 'database');

            const dropStagingOnComplete = this.getBoolParam(params, 'DropStagingDbOnComplete', true);
            const truncateTargetBeforeLoad = this.getBoolParam(params, 'TruncateTargetBeforeLoad', false);
            const batchSize = this.getNumberParam(params, 'BatchSize', 500000);
            const entityMapIDs = this.getStringListParam(params, 'EntityMapIDs');

            // 2. Resolve SQL Execution Provider (MultiProvider compliant). The record-map target is
            //    resolved here as well so a metadata problem fails before an hours-long restore.
            const sqlExecutor = this.getDatabaseProvider(params);
            this.resolveRecordMapTarget(sqlExecutor);
            ctx = {
                Params: params,
                Progress: progress,
                Executor: sqlExecutor,
                CompanyIntegrationID: companyIntegrationID,
                StagingDatabaseName: stagingDbName,
                ContainerUrl: '',
                StagingDbCreated: false,
            };

            // 3-5. Credential, Inspect, Restore
            await this.RunRestorePhase(ctx, backupUrls);

            // 6-9. Load, Watermarks, Cleanup
            const outputs = await this.RunLoadPhase(ctx, {
                BatchSize: batchSize,
                TruncateTargetBeforeLoad: truncateTargetBeforeLoad,
                EntityMapIDs: entityMapIDs,
                DropStagingDbOnComplete: dropStagingOnComplete,
                BackupStartDate: ctx.BackupStartDate!,
            });
            // The load phase times only itself; this run's duration also covers the restore.
            const durationSec = Math.round((Date.now() - startTime) / 1000);
            outputs.DurationSeconds = durationSec;
            for (const [name, value] of Object.entries(outputs)) {
                this.addOutputParam(params, name, value);
            }

            const message = `Successfully bootstrapped ${outputs.TablesProcessed} table(s) (${Number(outputs.TotalRowsTransferred).toLocaleString()} rows) in ${durationSec}s. Watermark seeded to ${outputs.BackupStartDate}.`;
            await progress.Complete(message, outputs);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: message,
                Params: params.Params,
            };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`[BootstrapSQLServerIntegrationFromBackupAction] Failure: ${message}`);
            await progress.Fail(message);

            // Automated fail-safe cleanup: the staging database if the restore was started (a restore that
            // failed midway leaves it in RESTORING state), and the storage credential whenever it was
            // created, including a failure before the restore (a bad SAS token fails at HEADERONLY).
            if (ctx) {
                await this.cleanUpAfterFailure(ctx.Executor, ctx.StagingDbCreated ? ctx.StagingDatabaseName : '', ctx.ContainerUrl, params.ContextUser);
            }

            return {
                Success: false,
                ResultCode: 'BOOTSTRAP_FAILED',
                Message: message,
                Params: params.Params,
            };
        } finally {
            if (ctx?.Runner) {
                await ctx.Runner.Dispose();
            }
        }
    }

    /**
     * Credential, Inspect and Restore stages: registers the storage credential for URL sources, reads the
     * backup header and file list across every stripe, and restores into the staging database. Sets
     * `ContainerUrl`, `BackupStartDate`, `BackupDatabaseName`, `Runner` and `StagingDbCreated` on `ctx`
     * as each becomes known, so the caller's failure cleanup and disposal see exactly what was created.
     */
    protected async RunRestorePhase(ctx: BootstrapRunContext, backupUrls: string[]): Promise<void> {
        const { Params: params, Progress: progress, Executor: sqlExecutor, StagingDatabaseName: stagingDbName } = ctx;

        // 3. Resolve Azure Storage SAS Token & Credential if URL sources are used
        const hasUrl = backupUrls.some(u => this.IsUrl(u));
        if (hasUrl) {
            progress.StageStart('Credential', 'Resolving the storage token and registering the SQL Server credential');
            const sasToken = await this.resolveSasToken(params);
            const firstUrl = backupUrls.find(u => this.IsUrl(u))!;
            ctx.ContainerUrl = this.extractContainerUrl(firstUrl);

            // Create SQL Server Storage Credential
            LogStatus(`[BootstrapSQLServer] Ensuring credential for storage container '${ctx.ContainerUrl}'...`);
            await this.ensureStorageCredential(sqlExecutor, ctx.ContainerUrl, sasToken, params.ContextUser);
            progress.StageComplete('Credential');
        }

        // 4. Inspect Backup Header & Filelist across ALL stripes (Msg 3132 prevention)
        progress.StageStart('Inspect', `Reading the backup header and file list across ${backupUrls.length} stripe(s)`);
        LogStatus(`[BootstrapSQLServer] Reading backup header from ${backupUrls.length} stripe(s)...`);
        const headerInfo = await this.inspectBackupHeader(sqlExecutor, backupUrls, params.ContextUser);
        LogStatus(`[BootstrapSQLServer] Backup Header: SourceDB='${headerInfo.DatabaseName}', BackupStartDate=${headerInfo.BackupStartDate.toISOString()}`);
        ctx.BackupStartDate = headerInfo.BackupStartDate;
        ctx.BackupDatabaseName = headerInfo.DatabaseName;

        const fileList = await this.inspectBackupFileList(sqlExecutor, backupUrls, params.ContextUser);
        const moveClauses = await this.buildMoveClauses(sqlExecutor, stagingDbName, fileList, params);
        progress.StageComplete('Inspect');

        // 5. Restore into a staging database that must not already exist: a restore WITH REPLACE over
        //    a user-typed name could otherwise overwrite a live database.
        progress.StageStart('Restore', `Restoring '${headerInfo.DatabaseName}' (backup of ${headerInfo.BackupStartDate.toISOString()}) into staging database [${stagingDbName}]`);
        await this.assertStagingDatabaseAbsent(sqlExecutor, stagingDbName, params.ContextUser);
        const runner = await this.createLongRunningRunner(sqlExecutor, params.ContextUser);
        ctx.Runner = runner;
        LogStatus(`[BootstrapSQLServer] Restoring staging database [${stagingDbName}] from ${backupUrls.length} backup source(s)...`);
        ctx.StagingDbCreated = true;
        await this.executeDatabaseRestore(runner, stagingDbName, backupUrls, moveClauses);
        await this.assertStagingAccessible(sqlExecutor, stagingDbName, params.ContextUser);
        progress.StageComplete('Restore');
    }

    /**
     * Throws {@link StagingNotAccessibleError} when the login this server runs with cannot read the
     * restored database (see that class for why a successful restore can leave it unreadable). Checked
     * right after the restore so the failure names the remedy, instead of the discover phase failing
     * with a bare "Login failed".
     */
    protected async assertStagingAccessible(executor: DatabaseProviderBase, stagingDbName: string, contextUser?: UserInfo): Promise<void> {
        ValidateIdentifier(stagingDbName, 'database');
        try {
            await executor.ExecuteSQL<{ TableCount: number }>(
                `SELECT COUNT(*) AS TableCount FROM [${stagingDbName}].sys.tables`,
                undefined,
                { description: `Check access to [${stagingDbName}]` },
                contextUser
            );
        } catch (err) {
            throw new StagingNotAccessibleError(StagingNotAccessibleMessage(stagingDbName, err instanceof Error ? err.message : String(err)));
        }
    }

    /**
     * Load, Watermarks and Cleanup stages over an already-restored staging database: loads each active
     * entity map's table, seeds the loaded maps' watermarks to `options.BackupStartDate`, and optionally
     * drops the staging database and storage credential (clearing `ctx.StagingDbCreated`). Uses
     * `ctx.Runner`, opening one onto `ctx` when the restore ran elsewhere. Returns the action's outputs;
     * their `DurationSeconds` covers this phase only.
     */
    protected async RunLoadPhase(
        ctx: BootstrapRunContext,
        options: { BatchSize: number; TruncateTargetBeforeLoad: boolean; EntityMapIDs?: string[]; DropStagingDbOnComplete: boolean; BackupStartDate: Date }
    ): Promise<Record<string, string | number | boolean>> {
        const startTime = Date.now();
        const { Params: params, Progress: progress, Executor: sqlExecutor, CompanyIntegrationID: companyIntegrationID, StagingDatabaseName: stagingDbName } = ctx;
        const backupStartDate = options.BackupStartDate;
        const recordMaps = this.resolveRecordMapTarget(sqlExecutor);
        if (!ctx.Runner) {
            ctx.Runner = await this.createLongRunningRunner(sqlExecutor, params.ContextUser);
        }
        const runner = ctx.Runner;

        // 6. Load Active Entity Maps for Company Integration
        const entityMaps = await this.loadEntityMaps(sqlExecutor, companyIntegrationID, options.EntityMapIDs, params.ContextUser);
        if (entityMaps.length === 0) {
            LogStatus(`[BootstrapSQLServer] Warning: No active entity maps found for CompanyIntegrationID=${companyIntegrationID}.`);
        }

        // 7. Execute Local In-Engine Minimally-Logged ETL
        let totalRowsInserted = 0;
        const tableResults: TableEtlResult[] = [];
        const loadedMaps: MJCompanyIntegrationEntityMapEntity[] = [];

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

            const targetPkCols = this.resolveTargetPrimaryKeys(entityInfo);

            const loadStage = `Load ${entityInfo.Name}`;
            progress.StageStart(loadStage, `Loading ${map.ExternalObjectName} into ${entityInfo.SchemaName}.${entityInfo.BaseTable}`);
            const result = await this.executeTableEtl(
                sqlExecutor,
                runner,
                companyIntegrationID,
                map,
                stagingDbName,
                map.ExternalObjectName,
                entityInfo.SchemaName,
                entityInfo.BaseTable,
                targetPkCols,
                options.BatchSize,
                backupStartDate,
                options.TruncateTargetBeforeLoad,
                recordMaps,
                params.ContextUser
            );

            // After successful table load and commit, invalidate RunView server cache for the entity (Task 7)
            await LocalCacheManager.Instance.InvalidateEntityCaches(entityInfo.Name);

            totalRowsInserted += result.RowsTransferred;
            tableResults.push(result);
            loadedMaps.push(map);
            progress.StageComplete(loadStage, result.RowsTransferred);
        }

        // 8. Seed Watermark via WatermarkService (Zero-Gap Invariant). Only a map whose table was
        //    actually loaded is seeded: seeding a skipped map would make its next incremental sync
        //    start after the backup date and lose every pre-backup row for good.
        LogStatus(`[BootstrapSQLServer] Seeding sync watermarks with BackupStartDate: ${backupStartDate.toISOString()}...`);
        progress.StageStart('Watermarks', `Seeding ${loadedMaps.length} sync watermark(s) to ${backupStartDate.toISOString()}`);
        const watermarkService = new WatermarkService();
        for (const map of loadedMaps) {
            await watermarkService.Update(
                map.ID,
                backupStartDate.toISOString(),
                params.ContextUser,
                'Pull'
            );
        }
        progress.StageComplete('Watermarks');

        // 9. Post-Restore Cleanup
        if (options.DropStagingDbOnComplete) {
            progress.StageStart('Cleanup', `Dropping staging database [${stagingDbName}] and the storage credential`);
            LogStatus(`[BootstrapSQLServer] Cleaning up staging database [${stagingDbName}]...`);
            await this.dropStagingDatabase(sqlExecutor, stagingDbName, params.ContextUser);
            ctx.StagingDbCreated = false;

            if (ctx.ContainerUrl) {
                LogStatus(`[BootstrapSQLServer] Cleaning up storage credential '${ctx.ContainerUrl}'...`);
                await this.dropStorageCredential(sqlExecutor, ctx.ContainerUrl, params.ContextUser);
            }
            progress.StageComplete('Cleanup');
        }

        return {
            BackupStartDate: backupStartDate.toISOString(),
            StagingDatabaseName: stagingDbName,
            TablesProcessed: tableResults.length,
            TotalRowsTransferred: totalRowsInserted,
            DurationSeconds: Math.round((Date.now() - startTime) / 1000),
            StagingDatabaseDropped: options.DropStagingDbOnComplete ? 1 : 0,
        };
    }

    /**
     * Whether this action owns its progress run and terminates it. The standalone bootstrap does; a
     * phase action invoked by a job reports failures as a stage error and leaves terminating to the job.
     */
    protected readonly TerminatesProgressRun: boolean = true;

    /** The result for an input the action cannot run with; the reason is reported on the run. */
    protected async rejectInput(params: RunActionParams, progress: BootstrapProgress, resultCode: string, message: string): Promise<ActionResultSimple> {
        await this.ReportFailure(progress, message, resultCode);
        return { Success: false, ResultCode: resultCode, Message: message, Params: params.Params };
    }

    /**
     * Reports a failure on the progress run: terminates it when this action owns the run, otherwise
     * emits a stage error carrying the result code and flushes, leaving the run open for its job.
     */
    protected async ReportFailure(progress: BootstrapProgress, message: string, resultCode: string): Promise<void> {
        if (this.TerminatesProgressRun) {
            await progress.Fail(message);
            return;
        }
        progress.StageError(progress.CurrentStage, message, { code: resultCode });
        await progress.Flush();
    }

    /** Best-effort teardown after a failure; each step is attempted even if the previous one failed. */
    protected async cleanUpAfterFailure(
        executor: DatabaseProviderBase,
        stagingDbName: string,
        containerUrl: string,
        contextUser?: UserInfo
    ): Promise<void> {
        if (stagingDbName) {
            try {
                await this.dropStagingDatabase(executor, stagingDbName, contextUser);
            } catch (cleanupErr) {
                LogError(`[BootstrapSQLServerIntegrationFromBackupAction] Post-failure drop of [${stagingDbName}] failed: ${cleanupErr}`);
            }
        }
        if (containerUrl) {
            try {
                await this.dropStorageCredential(executor, containerUrl, contextUser);
            } catch (cleanupErr) {
                LogError(`[BootstrapSQLServerIntegrationFromBackupAction] Post-failure drop of credential '${containerUrl}' failed: ${cleanupErr}`);
            }
        }
    }

    /**
     * The target entity's primary-key columns in metadata order. A synced shadow table carries the
     * source's own key columns as a soft (unenforced, nullable) primary key, single or composite; the load
     * copies them from the source row and the record map stores them `|`-joined, exactly as the sync
     * engine composes an entity record ID. A target whose key column has no source counterpart (a
     * surrogate key) gets a generated value instead; see {@link buildColumnMappings}.
     */
    protected resolveTargetPrimaryKeys(entityInfo: EntityInfo): string[] {
        if (entityInfo.PrimaryKeys.length === 0) {
            throw new Error(`Target entity '${entityInfo.Name}' has no primary key in metadata; the load cannot seed its record maps.`);
        }
        return entityInfo.PrimaryKeys.map(pk => pk.Name);
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
        const dataDir = TrimTrailingChars(customDataDir, '\\/');
        const logDir = TrimTrailingChars(customLogDir, '\\/');

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
     * Drops the staging database cleanly. Refuses (throws {@link StagingDropRefusedError}) a system
     * database, the database this server runs on, and — with `options.CreatedAfter` — a database created
     * before that instant, so a name that collides with an existing database can never drop it. A
     * database that does not exist is a no-op.
     */
    protected async dropStagingDatabase(
        executor: DatabaseProviderBase,
        stagingDbName: string,
        contextUser?: UserInfo,
        options: StagingDropOptions = {}
    ): Promise<void> {
        ValidateIdentifier(stagingDbName, 'database');
        AssertNotSystemDatabase(stagingDbName);
        const facts = await this.queryStagingDropFacts(executor, stagingDbName, contextUser);
        AssertDropAllowedByFacts(stagingDbName, facts, options);
        if (!facts.CreatedAtUtc) {
            return;
        }
        const cleanDbName = EscapeSQLString(stagingDbName);
        // A database left in RESTORING state by a failed restore cannot be ALTERed, but it can be dropped.
        const sql = `
IF DB_ID(N'${cleanDbName}') IS NOT NULL
BEGIN
    IF EXISTS (SELECT 1 FROM sys.databases WHERE name = N'${cleanDbName}' AND state_desc = 'ONLINE')
        ALTER DATABASE [${stagingDbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [${stagingDbName}];
END`;
        await executor.ExecuteSQL(sql, undefined, { isMutation: true, description: `DROP DATABASE [${stagingDbName}]` }, contextUser);
    }

    /**
     * The current database and the target's creation time in UTC (`create_date` is server-local, so it is
     * shifted by the server's current UTC offset). Fails closed: no row back is a refusal.
     */
    protected async queryStagingDropFacts(executor: DatabaseProviderBase, stagingDbName: string, contextUser?: UserInfo): Promise<StagingDropFacts> {
        const sql = `
SELECT DB_NAME() AS CurrentDatabase,
       (SELECT DATEADD(second, DATEDIFF(second, GETDATE(), GETUTCDATE()), create_date)
          FROM sys.databases WHERE name = N'${EscapeSQLString(stagingDbName)}') AS CreatedAtUtc;`;
        const rows = await executor.ExecuteSQL<{ CurrentDatabase: string | null; CreatedAtUtc: Date | string | null }>(
            sql, undefined, { description: `Check staging database [${stagingDbName}] may be dropped` }, contextUser
        );
        const row = rows?.[0];
        if (!row?.CurrentDatabase) {
            throw new StagingDropRefusedError(`Refusing to drop [${stagingDbName}]: the server did not report the current database.`);
        }
        const created = row.CreatedAtUtc == null ? null : new Date(row.CreatedAtUtc);
        return { CurrentDatabase: row.CurrentDatabase, CreatedAtUtc: created };
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
     * The source object's incremental watermark column, read from `MJ: Integration Objects` — the same
     * place the external-data-source connector reads it when it syncs deltas — when the staged table
     * carries that column.
     */
    protected async resolveWatermarkColumn(
        companyIntegrationID: string,
        externalObjectName: string,
        sourceColSet: Set<string>,
        contextUser?: UserInfo
    ): Promise<string | undefined> {
        const engine = IntegrationEngineBase.Instance;
        await engine.Config(false, contextUser);
        // Per-connection catalog first; the backup-archive flow populates the shared catalog instead.
        const object = engine.GetCompanyIntegrationObject(companyIntegrationID, externalObjectName)
            ?? this.getSharedCatalogObject(engine, companyIntegrationID, externalObjectName);
        const fieldName = object?.IncrementalWatermarkField?.trim();
        return fieldName && sourceColSet.has(fieldName.toLowerCase()) ? fieldName : undefined;
    }

    /** Looks the object up in the integration's shared catalog via the connection's parent integration. */
    private getSharedCatalogObject(engine: IntegrationEngineBase, companyIntegrationID: string, externalObjectName: string) {
        const integrationID = engine.GetCompanyIntegrationByID(companyIntegrationID)?.IntegrationID;
        return integrationID ? engine.GetIntegrationObject(integrationID, externalObjectName) : undefined;
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
        targetPkCols: string[],
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
        targetPkCols.forEach(c => ValidateIdentifier(c, 'column'));

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

        const watermarkSourceCol = await this.resolveWatermarkColumn(companyIntegrationID, externalObjectName, sourceColSet, contextUser);
        const mappings = this.buildColumnMappings(sourceColumns, targetColMap, targetPkCols, watermarkSourceCol);
        const totalRows = await this.queryTableRowCount(executor, stagingDbName, sourceSchema, sourceTable, contextUser);
        const chunkPkCol = this.resolveChunkColumn(pkColumns, sourceColumns, totalRows, batchSize);

        const batchSql = this.buildTableLoadBatch({
            StagingDbName: stagingDbName,
            SourceSchema: sourceSchema,
            SourceTable: sourceTable,
            TargetSchema: targetSchema,
            TargetTable: targetTable,
            TargetPkCols: targetPkCols,
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
     * The columns the load writes: the target key, the engine's integration bookkeeping columns, and
     * every domain column present on both sides. A target key column with a same-named source column is
     * the source's own key (the soft primary key of a synced shadow table) and is copied; one without a
     * source counterpart is a surrogate and gets a generated value. Source columns that collide with the
     * bookkeeping columns are skipped — the bookkeeping is set here.
     */
    protected buildColumnMappings(
        sourceColumns: SqlColumnInfo[],
        targetColMap: Map<string, string>,
        targetPkCols: string[],
        watermarkSourceCol: string | undefined
    ): ColumnMapping[] {
        const mappings: ColumnMapping[] = [];
        const sourceByLower = new Map(sourceColumns.map(c => [c.COLUMN_NAME.toLowerCase(), c.COLUMN_NAME]));
        const targetPkLowers = new Set(targetPkCols.map(c => c.toLowerCase()));

        for (const pkLower of targetPkLowers) {
            const targetName = targetColMap.get(pkLower);
            if (!targetName) {
                continue;
            }
            const sourceName = sourceByLower.get(pkLower);
            if (sourceName) {
                ValidateIdentifier(sourceName, 'column');
                mappings.push({ Target: targetName, Expr: `s.[${sourceName}]` });
            } else {
                // Surrogate key: NEWID() — NEWSEQUENTIALID() is only valid in a DEFAULT constraint (Msg 302).
                mappings.push({ Target: targetName, Expr: 'NEWID()' });
            }
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

        const reserved = new Set([...targetPkLowers, 'sourcerecordid', 'sourceobject', 'syncedat',
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

    /**
     * The inserted row's entity record ID for the record map: the target key value, or for a composite
     * key the values `|`-joined in metadata order with NULL as '' — the same composition the sync engine
     * uses (`composeEntityRecordID`), so later deltas match the bootstrapped rows.
     */
    protected buildEntityRecordIDExpression(targetPkCols: string[]): string {
        if (targetPkCols.length === 1) {
            return `CAST(inserted.[${targetPkCols[0]}] AS NVARCHAR(750))`;
        }
        return targetPkCols.map(c => `ISNULL(CAST(inserted.[${c}] AS NVARCHAR(750)), N'')`).join(" + N'|' + ");
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
    OUTPUT ${this.buildEntityRecordIDExpression(spec.TargetPkCols)}, src.[__MJExternalID]
    INTO #MJRecordMap ([EntityRecordID], [ExternalSystemRecordID]);
`;
    }

    /**
     * The chunked form of the load: the MERGE repeated over pages of `BatchSize` ROWS, each page bounded
     * by the next `TOP (n)` key after the last one loaded. Paging by row count rather than by key range
     * keeps the iteration count at rows / BatchSize however sparse the keys are (identity seeds,
     * snowflake IDs), where a key-range loop would spin through empty ranges for hours.
     */
    private buildChunkedLoad(spec: TableLoadBatchSpec, stagingSource: string): string {
        const pkCol = spec.ChunkPkCol!;
        const merge = this.buildMergeStatement(spec, stagingSource, `s.[${pkCol}] > @LastID AND s.[${pkCol}] <= @NextID`);
        return `    DECLARE @ChunkSize BIGINT = ${Math.floor(spec.BatchSize)};
    DECLARE @LastID BIGINT = (SELECT ISNULL(MIN([${pkCol}]), 0) - 1 FROM ${stagingSource});
    DECLARE @MaxID BIGINT = (SELECT ISNULL(MAX([${pkCol}]), 0) FROM ${stagingSource});
    DECLARE @NextID BIGINT;
    WHILE @LastID < @MaxID
    BEGIN
        SET @NextID = (SELECT MAX(page.[${pkCol}]) FROM (SELECT TOP (@ChunkSize) [${pkCol}] FROM ${stagingSource} WHERE [${pkCol}] > @LastID ORDER BY [${pkCol}]) AS page);
        IF @NextID IS NULL BREAK;
${merge}        SET @LastID = @NextID;
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
