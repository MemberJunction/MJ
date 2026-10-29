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
import { InvalidBackupParameterError } from './BackupSourceGuard.js';

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

/** One entity map's table load: where it reads, where it writes, and how. */
export interface TableEtlRequest {
    Executor: DatabaseProviderBase;
    Runner: LongRunningSqlRunner;
    CompanyIntegrationID: string;
    EntityMap: MJCompanyIntegrationEntityMapEntity;
    /** The target entity; its opt-ins sanction the direct insert and (for a truncate) the direct delete. */
    EntityInfo: EntityInfo;
    StagingDbName: string;
    TargetPkCols: string[];
    BatchSize: number;
    RestoreTimestamp: Date;
    TruncateTargetBeforeLoad: boolean;
    RecordMaps: RecordMapTarget;
    ContextUser?: UserInfo;
}

/** The staged source table of a load and what is known about it. */
interface StagedSourceFacts {
    SourceSchema: string;
    SourceTable: string;
    SourceColumns: SqlColumnInfo[];
    SourceColSet: Set<string>;
    TargetColMap: Map<string, string>;
    PkColumns: string[];
}

/** Options of the load phase. */
export interface BootstrapLoadOptions {
    BatchSize: number;
    TruncateTargetBeforeLoad: boolean;
    EntityMapIDs?: string[];
    DropStagingDbOnComplete: boolean;
    BackupStartDate: Date;
}

/** The validated inputs of a standalone bootstrap. */
interface BootstrapInput {
    CompanyIntegrationID: string;
    BackupUrls: string[];
    StagingDatabaseName: string;
    LoadOptions: Omit<BootstrapLoadOptions, 'BackupStartDate'>;
}

/** A refused input: its result code and message. */
interface BootstrapInputRefusal {
    ResultCode: string;
    Message: string;
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
    /**
     * The server's UTC clock just before RESTORE began (less a small margin). Every staging drop passes it
     * as `CreatedAfter`, so a database that already carried the staging name is never dropped. For the
     * load action it is the caller's `CreatedAfter`.
     */
    RestoreStartedAt?: Date;
    BackupStartDate?: Date;
    BackupDatabaseName?: string;
}

/**
 * Subtracted from the server's clock reading for {@link BootstrapRunContext.RestoreStartedAt}. The drop
 * guard converts `create_date` to UTC with a whole-second offset, which can land a second early.
 */
const RESTORE_START_CLOCK_MARGIN_MS = 2000;

/**
 * Action that performs a high-speed initial bootstrap of external SQL Server tables
 * into MemberJunction target tables using a staged Azure Blob backup restore and local in-engine ETL.
 *
 * Parameters (Input):
 *   - CompanyIntegrationID (required): ID of the CompanyIntegration being bootstrapped
 *   - BackupUrls (required): Single Azure Blob URL or comma-separated list of URLs (for striped backups)
 *   - StorageCredentialID (optional): ID of the MJ: Credentials record storing the SAS token (the caller must be able to read it)
 *   - SasToken (optional): Direct Shared Access Signature token for the Azure Blob container
 *   - StagingDatabaseName (optional): Name for the temporary staging database (default: auto-generated)
 *   - DropStagingDbOnComplete (optional): 'true' or 'false' (default: 'true') to reclaim staging disk space
 *   - BatchSize (optional): Chunk batch size for large table transfers (default: 500,000; 0 for unchunked)
 *   - TruncateTargetBeforeLoad (optional): 'true' or 'false' (default: 'false') to truncate target before load;
 *     each target entity must sanction direct SQL delete (`AllowDirectSQLDelete`)
 *   - TargetDataFileDirectory (optional): Custom file path for staging database .mdf file
 *   - TargetLogFileDirectory (optional): Custom file path for staging database .ldf file
 *   - EntityMapIDs (optional): Comma-separated list of specific EntityMapIDs to restrict the bootstrap
 *   - ProgressRunID (optional): The integration progress run to report stages to, when launched detached
 *     by the `IntegrationStartBootstrap` mutation; the client tails that run instead of awaiting the action
 *
 * Every backup source and directory is validated before any SQL (`INVALID_PARAMETER`): a URL must be a
 * blob in an Azure Blob Storage container; a disk path must be local, free of `..` and inside
 * `MJ_BACKUP_DISK_ROOTS` when that is set; a directory must be inside `MJ_STAGING_FILE_ROOTS` when set.
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
 * dedicated connection with no request timeout (see {@link BaseIntegrationAction.CreateLongRunningRunner})
 * rather than on the API's shared pool. Each table load is one T-SQL batch that opens, commits or rolls
 * back its own transaction, so the statements are guaranteed to share a connection.
 */
@RegisterClass(BaseAction, 'Bootstrap SQL Server Integration From Backup')
export class BootstrapSQLServerIntegrationFromBackupAction extends BaseIntegrationAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const startTime = Date.now();
        let ctx: BootstrapRunContext | undefined;
        // Opened before any validation so a detached caller sees even a parameter failure on its run.
        const progress = new BootstrapProgress(this.GetStringParam(params, 'ProgressRunID'), this.GetStringParam(params, 'CompanyIntegrationID') ?? '');

        try {
            const input = this.readBootstrapInput(params);
            if ('ResultCode' in input) {
                return await this.RejectInput(params, progress, input.ResultCode, input.Message);
            }
            ctx = this.createRunContext(params, progress, input);
            await this.RunRestorePhase(ctx, input.BackupUrls);
            const outputs = await this.RunLoadPhase(ctx, { ...input.LoadOptions, BackupStartDate: ctx.BackupStartDate! });
            return await this.bootstrapSucceeded(params, progress, outputs, startTime);
        } catch (error) {
            return await this.bootstrapFailed(params, progress, ctx, error);
        } finally {
            if (ctx?.Runner) {
                await ctx.Runner.Dispose();
            }
        }
    }

    /** The validated inputs, or the refusal of a missing or invalid one. Runs before any SQL. */
    private readBootstrapInput(params: RunActionParams): BootstrapInput | BootstrapInputRefusal {
        const companyIntegrationID = this.GetStringParam(params, 'CompanyIntegrationID');
        if (!companyIntegrationID) {
            return { ResultCode: 'MISSING_PARAMETER', Message: "Parameter 'CompanyIntegrationID' is required." };
        }
        const backupUrlsRaw = this.GetStringParam(params, 'BackupUrls');
        if (!backupUrlsRaw) {
            return { ResultCode: 'MISSING_PARAMETER', Message: "Parameter 'BackupUrls' is required." };
        }
        const backupUrls = backupUrlsRaw.split(',').map(u => u.trim()).filter(u => u.length > 0);
        if (backupUrls.length === 0) {
            return { ResultCode: 'INVALID_PARAMETER', Message: "Parameter 'BackupUrls' must contain at least one valid URL or file path." };
        }
        const problem = this.BackupInputProblem(params, backupUrls);
        if (problem) {
            return { ResultCode: 'INVALID_PARAMETER', Message: problem };
        }
        const stagingDbName = this.GetStringParam(params, 'StagingDatabaseName') ??
            `MJ_Staging_${companyIntegrationID.replace(/[^a-zA-Z0-9]/g, '').substring(0, 12)}_${Date.now()}`;
        ValidateIdentifier(stagingDbName, 'database');
        return { CompanyIntegrationID: companyIntegrationID, BackupUrls: backupUrls, StagingDatabaseName: stagingDbName, LoadOptions: this.readBootstrapLoadOptions(params) };
    }

    private readBootstrapLoadOptions(params: RunActionParams): Omit<BootstrapLoadOptions, 'BackupStartDate'> {
        return {
            DropStagingDbOnComplete: this.GetBoolParam(params, 'DropStagingDbOnComplete', true),
            TruncateTargetBeforeLoad: this.GetBoolParam(params, 'TruncateTargetBeforeLoad', false),
            BatchSize: this.GetNumberParam(params, 'BatchSize', 500000),
            EntityMapIDs: this.GetStringListParam(params, 'EntityMapIDs'),
        };
    }

    /**
     * The run's context on the action's provider (MultiProvider compliant). The record-map target is
     * resolved here as well so a metadata problem fails before an hours-long restore.
     */
    private createRunContext(params: RunActionParams, progress: BootstrapProgress, input: BootstrapInput): BootstrapRunContext {
        const sqlExecutor = this.GetDatabaseProvider(params);
        this.ResolveRecordMapTarget(sqlExecutor);
        return {
            Params: params,
            Progress: progress,
            Executor: sqlExecutor,
            CompanyIntegrationID: input.CompanyIntegrationID,
            StagingDatabaseName: input.StagingDatabaseName,
            ContainerUrl: '',
            StagingDbCreated: false,
        };
    }

    private async bootstrapSucceeded(
        params: RunActionParams,
        progress: BootstrapProgress,
        outputs: Record<string, string | number | boolean>,
        startTime: number
    ): Promise<ActionResultSimple> {
        // The load phase times only itself; this run's duration also covers the restore.
        const durationSec = Math.round((Date.now() - startTime) / 1000);
        outputs.DurationSeconds = durationSec;
        for (const [name, value] of Object.entries(outputs)) {
            this.AddOutputParam(params, name, value);
        }
        const message = `Successfully bootstrapped ${outputs.TablesProcessed} table(s) (${Number(outputs.TotalRowsTransferred).toLocaleString()} rows) in ${durationSec}s. Watermark seeded to ${outputs.BackupStartDate}.`;
        await progress.Complete(message, outputs);
        return { Success: true, ResultCode: 'SUCCESS', Message: message, Params: params.Params };
    }

    /**
     * Fails the run, then the automated fail-safe cleanup: the staging database if the restore was started
     * (a restore that failed midway leaves it in RESTORING state), and the storage credential whenever it
     * was created, including a failure before the restore (a bad SAS token fails at HEADERONLY).
     */
    private async bootstrapFailed(
        params: RunActionParams,
        progress: BootstrapProgress,
        ctx: BootstrapRunContext | undefined,
        error: unknown
    ): Promise<ActionResultSimple> {
        const message = error instanceof Error ? error.message : String(error);
        LogError(`[BootstrapSQLServerIntegrationFromBackupAction] Failure: ${message}`);
        await progress.Fail(message);
        if (ctx) {
            await this.CleanUpAfterFailure(ctx);
        }
        const resultCode = error instanceof InvalidBackupParameterError ? error.ResultCode : 'BOOTSTRAP_FAILED';
        return { Success: false, ResultCode: resultCode, Message: message, Params: params.Params };
    }

    /**
     * Credential, Inspect and Restore stages: registers the storage credential for URL sources, reads the
     * backup header and file list across every stripe, and restores into the staging database. Sets
     * `ContainerUrl`, `BackupStartDate`, `BackupDatabaseName`, `Runner`, `RestoreStartedAt` and
     * `StagingDbCreated` on `ctx` as each becomes known, so the caller's failure cleanup and disposal see
     * exactly what was created.
     */
    protected async RunRestorePhase(ctx: BootstrapRunContext, backupUrls: string[]): Promise<void> {
        if (backupUrls.some(u => this.IsUrl(u))) {
            await this.registerStorageCredential(ctx, backupUrls);
        }
        const header = await this.inspectBackup(ctx, backupUrls);
        const moveClauses = await this.BuildMoveClauses(ctx.Executor, ctx.StagingDatabaseName, header.FileList, ctx.Params);
        ctx.Progress.StageComplete('Inspect');
        await this.restoreIntoStaging(ctx, backupUrls, moveClauses, header.Info);
    }

    /** Credential stage: resolves the storage token and registers the SQL Server credential for the container. */
    private async registerStorageCredential(ctx: BootstrapRunContext, backupUrls: string[]): Promise<void> {
        ctx.Progress.StageStart('Credential', 'Resolving the storage token and registering the SQL Server credential');
        const sasToken = await this.ResolveSasToken(ctx.Params);
        const firstUrl = backupUrls.find(u => this.IsUrl(u))!;
        ctx.ContainerUrl = this.ExtractContainerUrl(firstUrl);
        LogStatus(`[BootstrapSQLServer] Ensuring credential for storage container '${ctx.ContainerUrl}'...`);
        await this.EnsureStorageCredential(ctx.Executor, ctx.ContainerUrl, sasToken, ctx.Params.ContextUser);
        ctx.Progress.StageComplete('Credential');
    }

    /** Inspect stage: the header and file list across ALL stripes (Msg 3132 prevention). Leaves the stage open. */
    private async inspectBackup(ctx: BootstrapRunContext, backupUrls: string[]): Promise<{ Info: SqlBackupHeaderInfo; FileList: SqlBackupFileListEntry[] }> {
        ctx.Progress.StageStart('Inspect', `Reading the backup header and file list across ${backupUrls.length} stripe(s)`);
        LogStatus(`[BootstrapSQLServer] Reading backup header from ${backupUrls.length} stripe(s)...`);
        const info = await this.InspectBackupHeader(ctx.Executor, backupUrls, ctx.Params.ContextUser);
        LogStatus(`[BootstrapSQLServer] Backup Header: SourceDB='${info.DatabaseName}', BackupStartDate=${info.BackupStartDate.toISOString()}`);
        ctx.BackupStartDate = info.BackupStartDate;
        ctx.BackupDatabaseName = info.DatabaseName;
        const fileList = await this.InspectBackupFileList(ctx.Executor, backupUrls, ctx.Params.ContextUser);
        return { Info: info, FileList: fileList };
    }

    /**
     * Restore stage, into a staging database that must not already exist: a restore WITH REPLACE over a
     * user-typed name could otherwise overwrite a live database. The restore start is read from the
     * server right before RESTORE, so the cleanup never drops a database created before it.
     */
    private async restoreIntoStaging(ctx: BootstrapRunContext, backupUrls: string[], moveClauses: string[], header: SqlBackupHeaderInfo): Promise<void> {
        const { Executor: sqlExecutor, StagingDatabaseName: stagingDbName, Params: params } = ctx;
        ctx.Progress.StageStart('Restore', `Restoring '${header.DatabaseName}' (backup of ${header.BackupStartDate.toISOString()}) into staging database [${stagingDbName}]`);
        await this.AssertStagingDatabaseAbsent(sqlExecutor, stagingDbName, params.ContextUser);
        ctx.Runner = await this.CreateLongRunningRunner(sqlExecutor, params.ContextUser);
        ctx.RestoreStartedAt = await this.ReadRestoreStartTime(sqlExecutor, params.ContextUser);
        LogStatus(`[BootstrapSQLServer] Restoring staging database [${stagingDbName}] from ${backupUrls.length} backup source(s)...`);
        ctx.StagingDbCreated = true;
        await this.ExecuteDatabaseRestore(ctx.Runner, stagingDbName, backupUrls, moveClauses);
        await this.AssertStagingAccessible(sqlExecutor, stagingDbName, params.ContextUser);
        ctx.Progress.StageComplete('Restore');
    }

    /**
     * The instant a restore starts, on the server's clock and in the same UTC conversion the drop guard
     * applies to `create_date` (see {@link QueryStagingDropFacts}), less {@link RESTORE_START_CLOCK_MARGIN_MS}.
     * Reading MJAPI's own clock instead would let clock skew between the two hosts refuse (or allow) a drop.
     */
    protected async ReadRestoreStartTime(executor: DatabaseProviderBase, contextUser?: UserInfo): Promise<Date> {
        const rows = await executor.ExecuteSQL<{ ServerUtcNow: Date | string | null }>(
            'SELECT DATEADD(second, DATEDIFF(second, GETDATE(), GETUTCDATE()), GETDATE()) AS ServerUtcNow;',
            undefined,
            { description: 'Read the restore start time' },
            contextUser
        );
        const raw = rows?.[0]?.ServerUtcNow;
        const serverNow = raw == null ? undefined : new Date(raw);
        if (!serverNow || isNaN(serverNow.getTime())) {
            throw new Error('The server did not report its current time, so the restore start cannot be recorded.');
        }
        return new Date(serverNow.getTime() - RESTORE_START_CLOCK_MARGIN_MS);
    }

    /**
     * Throws {@link StagingNotAccessibleError} when the login this server runs with cannot read the
     * restored database (see that class for why a successful restore can leave it unreadable). Checked
     * right after the restore so the failure names the remedy, instead of the discover phase failing
     * with a bare "Login failed".
     */
    protected async AssertStagingAccessible(executor: DatabaseProviderBase, stagingDbName: string, contextUser?: UserInfo): Promise<void> {
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
    protected async RunLoadPhase(ctx: BootstrapRunContext, options: BootstrapLoadOptions): Promise<Record<string, string | number | boolean>> {
        const startTime = Date.now();
        const recordMaps = this.ResolveRecordMapTarget(ctx.Executor);
        if (!ctx.Runner) {
            ctx.Runner = await this.CreateLongRunningRunner(ctx.Executor, ctx.Params.ContextUser);
        }

        // 6. Load Active Entity Maps for Company Integration
        const entityMaps = await this.LoadEntityMaps(ctx.Executor, ctx.CompanyIntegrationID, options.EntityMapIDs, ctx.Params.ContextUser);
        if (entityMaps.length === 0) {
            LogStatus(`[BootstrapSQLServer] Warning: No active entity maps found for CompanyIntegrationID=${ctx.CompanyIntegrationID}.`);
        }

        // 7-9. Local in-engine ETL, watermarks, cleanup
        const loaded = await this.loadEntityMapTables(ctx, ctx.Runner, entityMaps, options, recordMaps);
        await this.seedWatermarks(ctx, loaded.Maps, options.BackupStartDate);
        if (options.DropStagingDbOnComplete) {
            await this.cleanUpAfterLoad(ctx);
        }

        return {
            BackupStartDate: options.BackupStartDate.toISOString(),
            StagingDatabaseName: ctx.StagingDatabaseName,
            TablesProcessed: loaded.Results.length,
            TotalRowsTransferred: loaded.Results.reduce((sum, r) => sum + r.RowsTransferred, 0),
            DurationSeconds: Math.round((Date.now() - startTime) / 1000),
            StagingDatabaseDropped: options.DropStagingDbOnComplete ? 1 : 0,
        };
    }

    /** Loads each entity map's table in order; a map whose target entity is missing from metadata is skipped. */
    private async loadEntityMapTables(
        ctx: BootstrapRunContext,
        runner: LongRunningSqlRunner,
        entityMaps: MJCompanyIntegrationEntityMapEntity[],
        options: BootstrapLoadOptions,
        recordMaps: RecordMapTarget
    ): Promise<{ Results: TableEtlResult[]; Maps: MJCompanyIntegrationEntityMapEntity[] }> {
        const results: TableEtlResult[] = [];
        const maps: MJCompanyIntegrationEntityMapEntity[] = [];
        for (const map of entityMaps) {
            const entityInfo = ctx.Executor.EntityByID(map.EntityID);
            if (!entityInfo) {
                LogError(`[BootstrapSQLServer] Skipping EntityMap ${map.ID}: Target EntityID '${map.EntityID}' not found in metadata.`);
                continue;
            }
            results.push(await this.loadEntityMapTable(ctx, runner, map, entityInfo, options, recordMaps));
            maps.push(map);
        }
        return { Results: results, Maps: maps };
    }

    /** One entity map's load stage: the opt-in check, the table load, and the entity's cache invalidation. */
    private async loadEntityMapTable(
        ctx: BootstrapRunContext,
        runner: LongRunningSqlRunner,
        map: MJCompanyIntegrationEntityMapEntity,
        entityInfo: EntityInfo,
        options: BootstrapLoadOptions,
        recordMaps: RecordMapTarget
    ): Promise<TableEtlResult> {
        // Direct DML against an entity's base table is sanctioned only by the entity's own opt-in.
        if (!entityInfo.AllowDirectSQLInsert) {
            throw new Error(`Target entity '${entityInfo.Name}' does not have AllowDirectSQLInsert enabled. Direct SQL ETL is prohibited.`);
        }
        const targetPkCols = this.ResolveTargetPrimaryKeys(entityInfo);
        const loadStage = `Load ${entityInfo.Name}`;
        ctx.Progress.StageStart(loadStage, `Loading ${map.ExternalObjectName} into ${entityInfo.SchemaName}.${entityInfo.BaseTable}`);
        const result = await this.ExecuteTableEtl({
            Executor: ctx.Executor,
            Runner: runner,
            CompanyIntegrationID: ctx.CompanyIntegrationID,
            EntityMap: map,
            EntityInfo: entityInfo,
            StagingDbName: ctx.StagingDatabaseName,
            TargetPkCols: targetPkCols,
            BatchSize: options.BatchSize,
            RestoreTimestamp: options.BackupStartDate,
            TruncateTargetBeforeLoad: options.TruncateTargetBeforeLoad,
            RecordMaps: recordMaps,
            ContextUser: ctx.Params.ContextUser,
        });
        // After successful table load and commit, invalidate RunView server cache for the entity
        await LocalCacheManager.Instance.InvalidateEntityCaches(entityInfo.Name);
        ctx.Progress.StageComplete(loadStage, result.RowsTransferred);
        return result;
    }

    /**
     * Watermarks stage, via WatermarkService (Zero-Gap Invariant). Only a map whose table was actually
     * loaded is seeded: seeding a skipped map would make its next incremental sync start after the backup
     * date and lose every pre-backup row for good.
     */
    private async seedWatermarks(ctx: BootstrapRunContext, loadedMaps: MJCompanyIntegrationEntityMapEntity[], backupStartDate: Date): Promise<void> {
        LogStatus(`[BootstrapSQLServer] Seeding sync watermarks with BackupStartDate: ${backupStartDate.toISOString()}...`);
        ctx.Progress.StageStart('Watermarks', `Seeding ${loadedMaps.length} sync watermark(s) to ${backupStartDate.toISOString()}`);
        const watermarkService = new WatermarkService();
        for (const map of loadedMaps) {
            await watermarkService.Update(map.ID, backupStartDate.toISOString(), ctx.Params.ContextUser, 'Pull');
        }
        ctx.Progress.StageComplete('Watermarks');
    }

    /** Cleanup stage after a successful load: the staging database (never one created before the restore) and the credential. */
    private async cleanUpAfterLoad(ctx: BootstrapRunContext): Promise<void> {
        const { StagingDatabaseName: stagingDbName, Params: params } = ctx;
        ctx.Progress.StageStart('Cleanup', `Dropping staging database [${stagingDbName}] and the storage credential`);
        LogStatus(`[BootstrapSQLServer] Cleaning up staging database [${stagingDbName}]...`);
        await this.DropStagingDatabase(ctx.Executor, stagingDbName, params.ContextUser, { CreatedAfter: ctx.RestoreStartedAt });
        ctx.StagingDbCreated = false;

        if (ctx.ContainerUrl) {
            LogStatus(`[BootstrapSQLServer] Cleaning up storage credential '${ctx.ContainerUrl}'...`);
            await this.DropStorageCredential(ctx.Executor, ctx.ContainerUrl, params.ContextUser);
        }
        ctx.Progress.StageComplete('Cleanup');
    }

    /**
     * Whether this action owns its progress run and terminates it. The standalone bootstrap does; a
     * phase action invoked by a job reports failures as a stage error and leaves terminating to the job.
     */
    protected readonly TerminatesProgressRun: boolean = true;

    /** The result for an input the action cannot run with; the reason is reported on the run. */
    protected async RejectInput(params: RunActionParams, progress: BootstrapProgress, resultCode: string, message: string): Promise<ActionResultSimple> {
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

    /**
     * Best-effort teardown after a failure; each step is attempted even if the previous one failed. The
     * staging database is dropped only when this run started a restore into it, and only if it was created
     * after `ctx.RestoreStartedAt`.
     */
    protected async CleanUpAfterFailure(ctx: BootstrapRunContext): Promise<void> {
        const contextUser = ctx.Params.ContextUser;
        if (ctx.StagingDbCreated) {
            try {
                await this.DropStagingDatabase(ctx.Executor, ctx.StagingDatabaseName, contextUser, { CreatedAfter: ctx.RestoreStartedAt });
            } catch (cleanupErr) {
                LogError(`[BootstrapSQLServerIntegrationFromBackupAction] Post-failure drop of [${ctx.StagingDatabaseName}] failed: ${cleanupErr}`);
            }
        }
        if (ctx.ContainerUrl) {
            try {
                await this.DropStorageCredential(ctx.Executor, ctx.ContainerUrl, contextUser);
            } catch (cleanupErr) {
                LogError(`[BootstrapSQLServerIntegrationFromBackupAction] Post-failure drop of credential '${ctx.ContainerUrl}' failed: ${cleanupErr}`);
            }
        }
    }

    /**
     * The target entity's primary-key columns in metadata order. A synced shadow table carries the
     * source's own key columns as a soft (unenforced, nullable) primary key, single or composite; the load
     * copies them from the source row and the record map stores them `|`-joined, exactly as the sync
     * engine composes an entity record ID. A target whose key column has no source counterpart (a
     * surrogate key) gets a generated value instead; see {@link BuildColumnMappings}.
     */
    protected ResolveTargetPrimaryKeys(entityInfo: EntityInfo): string[] {
        if (entityInfo.PrimaryKeys.length === 0) {
            throw new Error(`Target entity '${entityInfo.Name}' has no primary key in metadata; the load cannot seed its record maps.`);
        }
        return entityInfo.PrimaryKeys.map(pk => pk.Name);
    }

    /**
     * Resolves where record maps are seeded from the `MJ: Company Integration Record Maps` entity so the
     * core schema name and base table come from metadata, and checks the entity sanctions direct SQL.
     */
    protected ResolveRecordMapTarget(provider: DatabaseProviderBase): RecordMapTarget {
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
    protected async AssertStagingDatabaseAbsent(
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
     * Constructs the MOVE clauses for data and log files. A caller-supplied directory has already passed
     * {@link BaseIntegrationAction.BackupInputProblem}; it is checked again here as defense in depth.
     */
    protected async BuildMoveClauses(
        executor: DatabaseProviderBase,
        stagingDbName: string,
        fileList: SqlBackupFileListEntry[],
        params: RunActionParams
    ): Promise<string[]> {
        const problem = this.BackupInputProblem(params, []);
        if (problem) {
            throw new InvalidBackupParameterError(problem);
        }
        let customDataDir = this.GetStringParam(params, 'TargetDataFileDirectory');
        let customLogDir = this.GetStringParam(params, 'TargetLogFileDirectory');

        if (!customDataDir || !customLogDir) {
            const defaultPaths = await this.QueryInstanceDefaultPaths(executor, params.ContextUser);
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
    protected async QueryInstanceDefaultPaths(
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
     * {@link AssertStagingDatabaseAbsent} has already established the name is free.
     */
    protected async ExecuteDatabaseRestore(
        runner: LongRunningSqlRunner,
        stagingDbName: string,
        backupUrls: string[],
        moveClauses: string[]
    ): Promise<void> {
        ValidateIdentifier(stagingDbName, 'database');
        const fromSources = this.BuildFromSourcesClause(backupUrls);
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
    protected async DropStagingDatabase(
        executor: DatabaseProviderBase,
        stagingDbName: string,
        contextUser?: UserInfo,
        options: StagingDropOptions = {}
    ): Promise<void> {
        ValidateIdentifier(stagingDbName, 'database');
        AssertNotSystemDatabase(stagingDbName);
        const facts = await this.QueryStagingDropFacts(executor, stagingDbName, contextUser);
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
    protected async QueryStagingDropFacts(executor: DatabaseProviderBase, stagingDbName: string, contextUser?: UserInfo): Promise<StagingDropFacts> {
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
    protected async LoadEntityMaps(
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
    protected async TargetTableHasRows(
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
    protected async ResolveWatermarkColumn(
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
     * itself is a single T-SQL batch on the long-running connection (see {@link BuildTableLoadBatch}).
     */
    protected async ExecuteTableEtl(request: TableEtlRequest): Promise<TableEtlResult> {
        const targetSchema = request.EntityInfo.SchemaName;
        const targetTable = request.EntityInfo.BaseTable;
        const source = await this.readStagedSourceFacts(request);
        const truncateTarget = await this.decideTruncate(request);

        const watermarkSourceCol = await this.ResolveWatermarkColumn(request.CompanyIntegrationID, request.EntityMap.ExternalObjectName, source.SourceColSet, request.ContextUser);
        const totalRows = await this.QueryTableRowCount(request.Executor, request.StagingDbName, source.SourceSchema, source.SourceTable, request.ContextUser);
        const batchSql = this.BuildTableLoadBatch({
            StagingDbName: request.StagingDbName,
            SourceSchema: source.SourceSchema,
            SourceTable: source.SourceTable,
            TargetSchema: targetSchema,
            TargetTable: targetTable,
            TargetPkCols: request.TargetPkCols,
            Mappings: this.BuildColumnMappings(source.SourceColumns, source.TargetColMap, request.TargetPkCols, watermarkSourceCol),
            ExternalIdExpr: this.BuildExternalIdExpression(source.PkColumns, source.SourceColSet),
            RestoreTimestampIso: request.RestoreTimestamp.toISOString(),
            ChunkPkCol: this.ResolveChunkColumn(source.PkColumns, source.SourceColumns, totalRows, request.BatchSize),
            BatchSize: request.BatchSize,
            TruncateTarget: truncateTarget,
            RecordMaps: request.RecordMaps,
            CompanyIntegrationID: request.CompanyIntegrationID,
            EntityID: request.EntityMap.EntityID,
        });

        const rows = await request.Runner.ExecuteSQL<{ RowsInserted: number | string }>(batchSql, `ETL Transfer ${source.SourceTable} -> ${targetTable}`);
        const rowsInserted = rows && rows.length > 0 ? Number(rows[0].RowsInserted) : 0;
        LogStatus(`[BootstrapSQLServer] Transferred ${source.SourceTable} -> ${targetTable}: ${rowsInserted.toLocaleString()} rows.`);

        return {
            SourceTable: `[${source.SourceSchema}].[${source.SourceTable}]`,
            TargetTable: `[${targetSchema}].[${targetTable}]`,
            RowsTransferred: rowsInserted,
        };
    }

    /** Validates every identifier of the load and reads the staged source's and the target's columns and keys. */
    private async readStagedSourceFacts(request: TableEtlRequest): Promise<StagedSourceFacts> {
        const { Executor: executor, StagingDbName: stagingDbName, ContextUser: contextUser } = request;
        const { SchemaName: targetSchema, BaseTable: targetTable } = request.EntityInfo;
        const { schema: sourceSchema, table: sourceTable } = this.ParseObjectIdentifier(request.EntityMap.ExternalObjectName);
        ValidateIdentifier(stagingDbName, 'database');
        ValidateIdentifier(sourceSchema, 'schema');
        ValidateIdentifier(sourceTable, 'table');
        ValidateIdentifier(targetSchema, 'schema');
        ValidateIdentifier(targetTable, 'table');
        request.TargetPkCols.forEach(c => ValidateIdentifier(c, 'column'));

        const sourceColumns = await this.QueryTableColumns(executor, stagingDbName, sourceSchema, sourceTable, contextUser);
        if (sourceColumns.length === 0) {
            throw new Error(`Source table '[${stagingDbName}].[${sourceSchema}].[${sourceTable}]' does not exist or has no columns.`);
        }
        const targetColumns = await this.QueryTableColumns(executor, undefined, targetSchema, targetTable, contextUser);
        if (targetColumns.length === 0) {
            throw new Error(`Target table '[${targetSchema}].[${targetTable}]' does not exist in target database.`);
        }
        const pkColumns = await this.QueryPrimaryKeyColumns(executor, stagingDbName, sourceSchema, sourceTable, contextUser);
        pkColumns.forEach(c => ValidateIdentifier(c, 'column'));

        return {
            SourceSchema: sourceSchema,
            SourceTable: sourceTable,
            SourceColumns: sourceColumns,
            SourceColSet: new Set(sourceColumns.map(c => c.COLUMN_NAME.toLowerCase())),
            TargetColMap: new Map(targetColumns.map(c => [c.COLUMN_NAME.toLowerCase(), c.COLUMN_NAME])),
            PkColumns: pkColumns,
        };
    }

    /**
     * Whether the load must first empty the target. A target with rows is refused unless the caller asked
     * for the truncate, and the truncate (TRUNCATE, or DELETE when a foreign key blocks it) is direct SQL
     * delete: both the target entity and the record maps must sanction it.
     */
    private async decideTruncate(request: TableEtlRequest): Promise<boolean> {
        const { SchemaName: targetSchema, BaseTable: targetTable, Name: entityName } = request.EntityInfo;
        const hasRows = await this.TargetTableHasRows(request.Executor, targetSchema, targetTable, request.ContextUser);
        if (!hasRows) {
            return false;
        }
        if (!request.TruncateTargetBeforeLoad) {
            throw new Error(`Target table '[${targetSchema}].[${targetTable}]' already contains data and 'TruncateTargetBeforeLoad' is false. Set TruncateTargetBeforeLoad to 'true' to allow replacing existing data, or clear target table before running.`);
        }
        if (!request.EntityInfo.AllowDirectSQLDelete) {
            throw new Error(`Target entity '${entityName}' does not have AllowDirectSQLDelete enabled, so 'TruncateTargetBeforeLoad' cannot empty [${targetSchema}].[${targetTable}]. Clear the table through the entity, or enable the opt-in.`);
        }
        if (!request.RecordMaps.AllowDirectSQLDelete) {
            throw new Error("Entity 'MJ: Company Integration Record Maps' does not have AllowDirectSQLDelete enabled, so existing record maps cannot be cleared for a re-run.");
        }
        return true;
    }

    /**
     * The columns the load writes: the target key, the engine's integration bookkeeping columns, and
     * every domain column present on both sides. A target key column with a same-named source column is
     * the source's own key (the soft primary key of a synced shadow table) and is copied; one without a
     * source counterpart is a surrogate and gets a generated value. Source columns that collide with the
     * bookkeeping columns are skipped — the bookkeeping is set here.
     */
    protected BuildColumnMappings(
        sourceColumns: SqlColumnInfo[],
        targetColMap: Map<string, string>,
        targetPkCols: string[],
        watermarkSourceCol: string | undefined
    ): ColumnMapping[] {
        const targetPkLowers = new Set(targetPkCols.map(c => c.toLowerCase()));
        return [
            ...this.buildKeyMappings(sourceColumns, targetColMap, targetPkLowers),
            ...this.buildBookkeepingMappings(targetColMap, watermarkSourceCol),
            ...this.buildDomainMappings(sourceColumns, targetColMap, targetPkLowers),
        ];
    }

    /** The target key columns: copied from a same-named source column, otherwise a generated surrogate. */
    private buildKeyMappings(sourceColumns: SqlColumnInfo[], targetColMap: Map<string, string>, targetPkLowers: Set<string>): ColumnMapping[] {
        const sourceByLower = new Map(sourceColumns.map(c => [c.COLUMN_NAME.toLowerCase(), c.COLUMN_NAME]));
        const mappings: ColumnMapping[] = [];
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
        return mappings;
    }

    /** The engine's integration bookkeeping columns the target carries. */
    private buildBookkeepingMappings(targetColMap: Map<string, string>, watermarkSourceCol: string | undefined): ColumnMapping[] {
        const mappings: ColumnMapping[] = [];
        const syncStatus = targetColMap.get('__mj_integration_syncstatus');
        if (syncStatus) {
            mappings.push({ Target: syncStatus, Expr: `N'Active'` });
        }
        const lastSyncedAt = targetColMap.get('__mj_integration_lastsyncedat');
        if (lastSyncedAt) {
            mappings.push({ Target: lastSyncedAt, Expr: '@RestoreTimestamp' });
        }
        const lastSeen = targetColMap.get('__mj_integration_lastseenmodifiedvalue');
        if (lastSeen && watermarkSourceCol) {
            mappings.push({ Target: lastSeen, Expr: `CAST(s.[${watermarkSourceCol}] AS NVARCHAR(255))` });
        }
        return mappings;
    }

    /** Every other source column with a same-named target column. */
    private buildDomainMappings(sourceColumns: SqlColumnInfo[], targetColMap: Map<string, string>, targetPkLowers: Set<string>): ColumnMapping[] {
        const reserved = new Set([...targetPkLowers, 'sourcerecordid', 'sourceobject', 'syncedat',
            '__mj_integration_syncstatus', '__mj_integration_lastsyncedat', '__mj_integration_lastseenmodifiedvalue']);
        const mappings: ColumnMapping[] = [];
        for (const sCol of sourceColumns) {
            const targetExactName = targetColMap.get(sCol.COLUMN_NAME.toLowerCase());
            if (reserved.has(sCol.COLUMN_NAME.toLowerCase()) || !targetExactName) {
                continue;
            }
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
    protected BuildExternalIdExpression(pkColumns: string[], sourceColSet: Set<string>): string {
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
    protected BuildEntityRecordIDExpression(targetPkCols: string[]): string {
        if (targetPkCols.length === 1) {
            return `CAST(inserted.[${targetPkCols[0]}] AS NVARCHAR(750))`;
        }
        return targetPkCols.map(c => `ISNULL(CAST(inserted.[${c}] AS NVARCHAR(750)), N'')`).join(" + N'|' + ");
    }

    /** The key column to chunk a large load by, or undefined: only a single-column integer key qualifies. */
    protected ResolveChunkColumn(pkColumns: string[], sourceColumns: SqlColumnInfo[], totalRows: number, batchSize: number): string | undefined {
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
    protected BuildTableLoadBatch(spec: TableLoadBatchSpec): string {
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

    /**
     * Clear the target table (DELETE when a foreign key blocks TRUNCATE) and its record maps for a re-run.
     * Reached only after {@link decideTruncate} found both opt-ins (`AllowDirectSQLDelete`) set.
     */
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
    OUTPUT ${this.BuildEntityRecordIDExpression(spec.TargetPkCols)}, src.[__MJExternalID]
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
    protected async QueryTableColumns(
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
    protected async QueryPrimaryKeyColumns(
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
    protected async QueryTableRowCount(
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
    protected ParseObjectIdentifier(identifier: string): { schema: string; table: string } {
        const clean = identifier.replace(/[\[\]]/g, '').trim();
        const parts = clean.split('.');
        if (parts.length >= 2) {
            return { schema: parts[0], table: parts.slice(1).join('.') };
        }
        return { schema: 'dbo', table: clean };
    }
}
