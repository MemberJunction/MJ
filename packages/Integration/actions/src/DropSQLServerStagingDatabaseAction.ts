import { RegisterClass } from '@memberjunction/global';
import { LogError, DatabaseProviderBase } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import {
    BootstrapProgress,
    BootstrapSQLServerIntegrationFromBackupAction
} from './BootstrapSQLServerIntegrationFromBackupAction.js';
import { AssertStagingDatabaseName, StagingDropRefusedError } from './StagingDropGuard.js';

/** The validated inputs of a drop, or the reason the action cannot run. */
type DropInput =
    | { StagingDatabaseName: string; ContainerUrl?: string; DropDatabase: boolean; CreatedAfter?: Date }
    | { ResultCode: string; Message: string };

/**
 * Last phase of seeding an integration from a SQL Server backup archive: drops the staging database
 * and, when the restore read from storage, its SQL Server storage credential. Dropping a database that
 * no longer exists succeeds, so the calling job can always run this phase.
 *
 * Safety: a system database and the database this server runs on are always refused; a name outside
 * `MJ_Staging_` is refused unless `AllowAnyName` is 'true'; with `CreatedAfter`, a database created
 * before that instant is refused. Every refusal is `DROP_REFUSED`.
 *
 * Parameters (Input):
 *   - StagingDatabaseName (required unless DropDatabase is 'false'): the staging database to drop
 *   - ContainerUrl (optional; required when DropDatabase is 'false'): the storage container whose SQL Server credential is dropped too
 *   - DropDatabase (optional): 'false' to drop only the storage credential and keep the database (default 'true')
 *   - CreatedAfter (optional): ISO timestamp; refuse a database created before it (the job passes its restore start)
 *   - AllowAnyName (optional): 'true' to drop a database whose name does not start with `MJ_Staging_` (default 'false')
 *   - ProgressRunID (optional): the integration progress run to report the stage to
 *   - CompanyIntegrationID (optional): recorded on the progress run's manifest only
 *
 * Parameters (Output):
 *   - StagingDatabaseDropped: 1 when the database was dropped, 0 when it was kept (DropDatabase 'false')
 *
 * The progress run is never terminated here (the calling job owns it); a failure is a stage error.
 */
@RegisterClass(BaseAction, 'Drop SQL Server Staging Database')
export class DropSQLServerStagingDatabaseAction extends BootstrapSQLServerIntegrationFromBackupAction {
    protected override readonly TerminatesProgressRun = false;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const progress = new BootstrapProgress(this.getStringParam(params, 'ProgressRunID'), this.getStringParam(params, 'CompanyIntegrationID') ?? '');
        try {
            const input = this.readDropInput(params);
            if ('ResultCode' in input) {
                return await this.rejectInput(params, progress, input.ResultCode, input.Message);
            }
            progress.StageStart('Cleanup', this.stageMessage(input));
            await this.dropStagingAndCredential(this.getDatabaseProvider(params), input, params);
            progress.StageComplete('Cleanup');
            this.addOutputParam(params, 'StagingDatabaseDropped', input.DropDatabase ? 1 : 0);
            const message = input.DropDatabase
                ? `Dropped staging database [${input.StagingDatabaseName}].`
                : `Dropped the storage credential; kept staging database [${input.StagingDatabaseName}].`;
            return { Success: true, ResultCode: 'SUCCESS', Message: message, Params: params.Params };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const resultCode = error instanceof StagingDropRefusedError ? error.ResultCode : 'DROP_FAILED';
            LogError(`[DropSQLServerStagingDatabaseAction] Failure: ${message}`);
            await this.ReportFailure(progress, message, resultCode);
            return { Success: false, ResultCode: resultCode, Message: message, Params: params.Params };
        } finally {
            await progress.Flush();
        }
    }

    /** The validated inputs; the name rule is checked here, so a refusal never reaches the database. */
    private readDropInput(params: RunActionParams): DropInput {
        const stagingDbName = this.getStringParam(params, 'StagingDatabaseName') ?? '';
        const containerUrl = this.getStringParam(params, 'ContainerUrl');
        const dropDatabase = this.getBoolParam(params, 'DropDatabase', true);
        if (dropDatabase && !stagingDbName) {
            return { ResultCode: 'MISSING_PARAMETER', Message: "Parameter 'StagingDatabaseName' is required." };
        }
        if (!dropDatabase && !containerUrl) {
            return { ResultCode: 'MISSING_PARAMETER', Message: "Parameter 'ContainerUrl' is required when 'DropDatabase' is 'false'." };
        }
        const createdAfterRaw = this.getStringParam(params, 'CreatedAfter');
        const createdAfter = createdAfterRaw ? new Date(createdAfterRaw) : undefined;
        if (createdAfter && isNaN(createdAfter.getTime())) {
            return { ResultCode: 'INVALID_PARAMETER', Message: `Parameter 'CreatedAfter' is not a valid date: '${createdAfterRaw}'.` };
        }
        if (dropDatabase) {
            try {
                AssertStagingDatabaseName(stagingDbName, this.getBoolParam(params, 'AllowAnyName', false));
            } catch (error) {
                return { ResultCode: 'DROP_REFUSED', Message: error instanceof Error ? error.message : String(error) };
            }
        }
        return { StagingDatabaseName: stagingDbName, ContainerUrl: containerUrl, DropDatabase: dropDatabase, CreatedAfter: createdAfter };
    }

    private stageMessage(input: Exclude<DropInput, { ResultCode: string }>): string {
        if (!input.DropDatabase) {
            return `Dropping the storage credential; keeping staging database [${input.StagingDatabaseName}]`;
        }
        return `Dropping staging database [${input.StagingDatabaseName}]${input.ContainerUrl ? ' and the storage credential' : ''}`;
    }

    private async dropStagingAndCredential(
        executor: DatabaseProviderBase,
        input: Exclude<DropInput, { ResultCode: string }>,
        params: RunActionParams
    ): Promise<void> {
        if (input.DropDatabase) {
            await this.dropStagingDatabase(executor, input.StagingDatabaseName, params.ContextUser, { CreatedAfter: input.CreatedAfter });
        }
        if (input.ContainerUrl) {
            await this.dropStorageCredential(executor, input.ContainerUrl, params.ContextUser);
        }
    }
}
