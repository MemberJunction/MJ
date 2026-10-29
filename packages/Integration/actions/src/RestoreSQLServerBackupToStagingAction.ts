import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { ValidateIdentifier } from '@memberjunction/schema-engine';
import {
    BootstrapProgress,
    BootstrapSQLServerIntegrationFromBackupAction,
    type BootstrapRunContext
} from './BootstrapSQLServerIntegrationFromBackupAction.js';
import { StagingNotAccessibleError } from './StagingAccessGuard.js';

/** The validated inputs of a restore, or the reason the action cannot run. */
type RestoreInput =
    | { CompanyIntegrationID: string; StagingDatabaseName: string; BackupUrls: string[] }
    | { ResultCode: string; Message: string };

/**
 * First phase of seeding an integration from a SQL Server backup archive: restores the backup into a
 * named staging database and stops there. A server-side job invokes this, then
 * `Load SQL Server Integration From Staging`, then `Drop SQL Server Staging Database`.
 *
 * Parameters (Input):
 *   - CompanyIntegrationID (required): the Company Integration being seeded
 *   - BackupUrls (required): one backup URL or path, or a comma-separated list for a striped backup
 *   - StagingDatabaseName (required): the database to restore into; it must not already exist
 *   - SasToken / StorageCredentialID (optional): storage access for URL sources
 *   - TargetDataFileDirectory / TargetLogFileDirectory (optional): where the staging files go
 *   - ProgressRunID (optional): the integration progress run to report the stages to
 *
 * Parameters (Output):
 *   - BackupStartDate: when the backup began (ISO UTC); the load phase seeds watermarks to it
 *   - BackupDatabaseName: the source database recorded in the backup header
 *   - StagingDatabaseName: the restored staging database
 *   - ContainerUrl: the storage container whose SQL Server credential was registered ('' for local paths)
 *
 * The progress run is never terminated here (the calling job owns it); a failure is a stage error.
 */
@RegisterClass(BaseAction, 'Restore SQL Server Backup To Staging')
export class RestoreSQLServerBackupToStagingAction extends BootstrapSQLServerIntegrationFromBackupAction {
    protected override readonly TerminatesProgressRun = false;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const progress = new BootstrapProgress(this.getStringParam(params, 'ProgressRunID'), this.getStringParam(params, 'CompanyIntegrationID') ?? '');
        let ctx: BootstrapRunContext | undefined;
        try {
            const input = this.readRestoreInput(params);
            if ('ResultCode' in input) {
                return await this.rejectInput(params, progress, input.ResultCode, input.Message);
            }
            ctx = {
                Params: params,
                Progress: progress,
                Executor: this.getDatabaseProvider(params),
                CompanyIntegrationID: input.CompanyIntegrationID,
                StagingDatabaseName: input.StagingDatabaseName,
                ContainerUrl: '',
                StagingDbCreated: false,
            };
            await this.RunRestorePhase(ctx, input.BackupUrls);
            return this.restoreSucceeded(params, ctx);
        } catch (error) {
            return await this.restoreFailed(params, progress, ctx, error);
        } finally {
            await ctx?.Runner?.Dispose();
            await progress.Flush();
        }
    }

    private readRestoreInput(params: RunActionParams): RestoreInput {
        const companyIntegrationID = this.getStringParam(params, 'CompanyIntegrationID');
        const backupUrlsRaw = this.getStringParam(params, 'BackupUrls');
        const stagingDatabaseName = this.getStringParam(params, 'StagingDatabaseName');
        if (!companyIntegrationID) {
            return { ResultCode: 'MISSING_PARAMETER', Message: "Parameter 'CompanyIntegrationID' is required." };
        }
        if (!backupUrlsRaw) {
            return { ResultCode: 'MISSING_PARAMETER', Message: "Parameter 'BackupUrls' is required." };
        }
        if (!stagingDatabaseName) {
            return { ResultCode: 'MISSING_PARAMETER', Message: "Parameter 'StagingDatabaseName' is required." };
        }
        const backupUrls = backupUrlsRaw.split(',').map(u => u.trim()).filter(u => u.length > 0);
        if (backupUrls.length === 0) {
            return { ResultCode: 'INVALID_PARAMETER', Message: "Parameter 'BackupUrls' must contain at least one valid URL or file path." };
        }
        ValidateIdentifier(stagingDatabaseName, 'database');
        return { CompanyIntegrationID: companyIntegrationID, StagingDatabaseName: stagingDatabaseName, BackupUrls: backupUrls };
    }

    private restoreSucceeded(params: RunActionParams, ctx: BootstrapRunContext): ActionResultSimple {
        const backupStartDate = ctx.BackupStartDate!.toISOString();
        this.addOutputParam(params, 'BackupStartDate', backupStartDate);
        this.addOutputParam(params, 'BackupDatabaseName', ctx.BackupDatabaseName ?? '');
        this.addOutputParam(params, 'StagingDatabaseName', ctx.StagingDatabaseName);
        this.addOutputParam(params, 'ContainerUrl', ctx.ContainerUrl);
        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: `Restored '${ctx.BackupDatabaseName}' (backup of ${backupStartDate}) into staging database [${ctx.StagingDatabaseName}].`,
            Params: params.Params,
        };
    }

    /** Fails the run and tears down whatever the restore created: the staging database and the credential. */
    private async restoreFailed(
        params: RunActionParams,
        progress: BootstrapProgress,
        ctx: BootstrapRunContext | undefined,
        error: unknown
    ): Promise<ActionResultSimple> {
        const message = error instanceof Error ? error.message : String(error);
        const resultCode = error instanceof StagingNotAccessibleError ? error.ResultCode : 'RESTORE_FAILED';
        LogError(`[RestoreSQLServerBackupToStagingAction] Failure: ${message}`);
        await this.ReportFailure(progress, message, resultCode);
        if (ctx) {
            await this.cleanUpAfterFailure(ctx.Executor, ctx.StagingDbCreated ? ctx.StagingDatabaseName : '', ctx.ContainerUrl, params.ContextUser);
        }
        return { Success: false, ResultCode: resultCode, Message: message, Params: params.Params };
    }
}
