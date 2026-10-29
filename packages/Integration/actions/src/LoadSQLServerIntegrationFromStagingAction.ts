import { RegisterClass, EscapeSQLString } from '@memberjunction/global';
import { LogError, DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { ValidateIdentifier } from '@memberjunction/schema-engine';
import {
    BootstrapProgress,
    BootstrapSQLServerIntegrationFromBackupAction,
    type BootstrapRunContext
} from './BootstrapSQLServerIntegrationFromBackupAction.js';
import { AssertStagingDatabaseName, StagingDropRefusedError } from './StagingDropGuard.js';

/** The validated inputs of a load, or the reason the action cannot run. */
type LoadInput =
    | { CompanyIntegrationID: string; StagingDatabaseName: string; BackupStartDate: Date; ContainerUrl: string }
    | { ResultCode: string; Message: string };

/**
 * Second phase of seeding an integration from a SQL Server backup archive: loads every active entity
 * map's table from a staging database restored earlier (`Restore SQL Server Backup To Staging`) and
 * seeds the loaded maps' watermarks to the backup's start date.
 *
 * Parameters (Input):
 *   - CompanyIntegrationID (required): the Company Integration being seeded
 *   - StagingDatabaseName (required): the restored staging database; it must exist
 *   - BackupStartDate (required): when the backup began (ISO UTC), as the restore phase reported it
 *   - BatchSize (optional): chunk size for large tables (default 500,000; 0 for unchunked)
 *   - TruncateTargetBeforeLoad (optional): 'true' to empty each target first (default 'false')
 *   - EntityMapIDs (optional): comma-separated entity map IDs to restrict the load to
 *   - DropStagingDbOnComplete (optional): 'true' to drop the staging database afterwards (default 'false'). The
 *     drop refuses a system database, the server's own database and — unless AllowAnyName is 'true' — a name
 *     that does not start with `MJ_Staging_` (`DROP_REFUSED`, checked before anything loads)
 *   - AllowAnyName (optional): 'true' to let DropStagingDbOnComplete drop a name outside `MJ_Staging_` (default 'false')
 *   - ContainerUrl (optional): the container whose SQL Server credential is dropped with the staging database
 *   - ProgressRunID (optional): the integration progress run to report the stages to
 *
 * Parameters (Output): BackupStartDate, StagingDatabaseName, TablesProcessed, TotalRowsTransferred,
 * DurationSeconds, StagingDatabaseDropped — as `Bootstrap SQL Server Integration From Backup` reports them.
 *
 * The progress run is never terminated here (the calling job owns it); a failure is a stage error. A failed load
 * keeps the staging database so the load can be retried without restoring again.
 */
@RegisterClass(BaseAction, 'Load SQL Server Integration From Staging')
export class LoadSQLServerIntegrationFromStagingAction extends BootstrapSQLServerIntegrationFromBackupAction {
    protected override readonly TerminatesProgressRun = false;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const progress = new BootstrapProgress(this.getStringParam(params, 'ProgressRunID'), this.getStringParam(params, 'CompanyIntegrationID') ?? '');
        let ctx: BootstrapRunContext | undefined;
        try {
            const input = this.readLoadInput(params);
            if ('ResultCode' in input) {
                return await this.rejectInput(params, progress, input.ResultCode, input.Message);
            }
            const executor = this.getDatabaseProvider(params);
            if (!(await this.stagingDatabaseExists(executor, input.StagingDatabaseName, params.ContextUser))) {
                return await this.rejectInput(params, progress, 'STAGING_NOT_FOUND', `Staging database [${input.StagingDatabaseName}] does not exist on this instance.`);
            }
            ctx = this.buildLoadContext(params, progress, executor, input);
            const outputs = await this.RunLoadPhase(ctx, this.readLoadOptions(params, input.BackupStartDate));
            return this.loadSucceeded(params, outputs);
        } catch (error) {
            return await this.loadFailed(params, progress, error);
        } finally {
            await ctx?.Runner?.Dispose();
            await progress.Flush();
        }
    }

    private readLoadInput(params: RunActionParams): LoadInput {
        const companyIntegrationID = this.getStringParam(params, 'CompanyIntegrationID');
        const stagingDatabaseName = this.getStringParam(params, 'StagingDatabaseName');
        const backupStartDateRaw = this.getStringParam(params, 'BackupStartDate');
        if (!companyIntegrationID) {
            return { ResultCode: 'MISSING_PARAMETER', Message: "Parameter 'CompanyIntegrationID' is required." };
        }
        if (!stagingDatabaseName) {
            return { ResultCode: 'MISSING_PARAMETER', Message: "Parameter 'StagingDatabaseName' is required." };
        }
        if (!backupStartDateRaw) {
            return { ResultCode: 'MISSING_PARAMETER', Message: "Parameter 'BackupStartDate' is required." };
        }
        const backupStartDate = new Date(backupStartDateRaw);
        if (isNaN(backupStartDate.getTime())) {
            return { ResultCode: 'INVALID_PARAMETER', Message: `Parameter 'BackupStartDate' is not a valid date: '${backupStartDateRaw}'.` };
        }
        ValidateIdentifier(stagingDatabaseName, 'database');
        const refusal = this.dropRefusal(params, stagingDatabaseName);
        if (refusal) {
            return { ResultCode: 'DROP_REFUSED', Message: refusal };
        }
        return {
            CompanyIntegrationID: companyIntegrationID,
            StagingDatabaseName: stagingDatabaseName,
            BackupStartDate: backupStartDate,
            ContainerUrl: this.getStringParam(params, 'ContainerUrl') ?? '',
        };
    }

    /** Why the requested drop-on-complete is refused, or undefined when it is allowed (or not requested). */
    private dropRefusal(params: RunActionParams, stagingDatabaseName: string): string | undefined {
        if (!this.getBoolParam(params, 'DropStagingDbOnComplete', false)) {
            return undefined;
        }
        try {
            AssertStagingDatabaseName(stagingDatabaseName, this.getBoolParam(params, 'AllowAnyName', false));
            return undefined;
        } catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }

    private readLoadOptions(params: RunActionParams, backupStartDate: Date) {
        return {
            BatchSize: this.getNumberParam(params, 'BatchSize', 500000),
            TruncateTargetBeforeLoad: this.getBoolParam(params, 'TruncateTargetBeforeLoad', false),
            EntityMapIDs: this.getStringListParam(params, 'EntityMapIDs'),
            DropStagingDbOnComplete: this.getBoolParam(params, 'DropStagingDbOnComplete', false),
            BackupStartDate: backupStartDate,
        };
    }

    private buildLoadContext(
        params: RunActionParams,
        progress: BootstrapProgress,
        executor: DatabaseProviderBase,
        input: Exclude<LoadInput, { ResultCode: string }>
    ): BootstrapRunContext {
        return {
            Params: params,
            Progress: progress,
            Executor: executor,
            CompanyIntegrationID: input.CompanyIntegrationID,
            StagingDatabaseName: input.StagingDatabaseName,
            ContainerUrl: input.ContainerUrl,
            StagingDbCreated: true,
        };
    }

    /** True when the named database exists on the instance (`DB_ID` is null otherwise). */
    private async stagingDatabaseExists(executor: DatabaseProviderBase, stagingDbName: string, contextUser?: UserInfo): Promise<boolean> {
        const sql = `SELECT DB_ID(N'${EscapeSQLString(stagingDbName)}') AS DatabaseId;`;
        const rows = await executor.ExecuteSQL<{ DatabaseId: number | null }>(sql, undefined, { description: 'Check staging database exists' }, contextUser);
        return !!rows && rows.length > 0 && rows[0].DatabaseId != null;
    }

    private loadSucceeded(params: RunActionParams, outputs: Record<string, string | number | boolean>): ActionResultSimple {
        for (const [name, value] of Object.entries(outputs)) {
            this.addOutputParam(params, name, value);
        }
        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: `Loaded ${outputs.TablesProcessed} table(s) (${Number(outputs.TotalRowsTransferred).toLocaleString()} rows) from [${outputs.StagingDatabaseName}] in ${outputs.DurationSeconds}s. Watermark seeded to ${outputs.BackupStartDate}.`,
            Params: params.Params,
        };
    }

    private async loadFailed(params: RunActionParams, progress: BootstrapProgress, error: unknown): Promise<ActionResultSimple> {
        const message = error instanceof Error ? error.message : String(error);
        LogError(`[LoadSQLServerIntegrationFromStagingAction] Failure: ${message}`);
        const resultCode = error instanceof StagingDropRefusedError ? error.ResultCode : 'LOAD_FAILED';
        await this.ReportFailure(progress, message, resultCode);
        return { Success: false, ResultCode: resultCode, Message: message, Params: params.Params };
    }
}
