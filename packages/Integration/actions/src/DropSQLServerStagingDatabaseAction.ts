import { RegisterClass } from '@memberjunction/global';
import { LogError, DatabaseProviderBase } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import {
    BootstrapProgress,
    BootstrapSQLServerIntegrationFromBackupAction
} from './BootstrapSQLServerIntegrationFromBackupAction.js';

/**
 * Last phase of seeding an integration from a SQL Server backup archive: drops the staging database
 * and, when the restore read from storage, its SQL Server storage credential. Dropping a database that
 * no longer exists succeeds, so the calling job can always run this phase.
 *
 * Parameters (Input):
 *   - StagingDatabaseName (required): the staging database to drop
 *   - ContainerUrl (optional): the storage container whose SQL Server credential is dropped too
 *   - ProgressRunID (optional): the integration progress run to report the stage to
 *   - CompanyIntegrationID (optional): recorded on the progress run's manifest only
 *
 * Parameters (Output):
 *   - StagingDatabaseDropped: 1
 *
 * The progress run is never completed here (the calling job owns it); a failure fails it.
 */
@RegisterClass(BaseAction, 'Drop SQL Server Staging Database')
export class DropSQLServerStagingDatabaseAction extends BootstrapSQLServerIntegrationFromBackupAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const progress = new BootstrapProgress(this.getStringParam(params, 'ProgressRunID'), this.getStringParam(params, 'CompanyIntegrationID') ?? '');
        try {
            const stagingDbName = this.getStringParam(params, 'StagingDatabaseName');
            if (!stagingDbName) {
                return await this.rejectInput(params, progress, 'MISSING_PARAMETER', "Parameter 'StagingDatabaseName' is required.");
            }
            const containerUrl = this.getStringParam(params, 'ContainerUrl');
            progress.StageStart('Cleanup', `Dropping staging database [${stagingDbName}]${containerUrl ? ' and the storage credential' : ''}`);
            await this.dropStagingAndCredential(this.getDatabaseProvider(params), stagingDbName, containerUrl, params);
            progress.StageComplete('Cleanup');
            this.addOutputParam(params, 'StagingDatabaseDropped', 1);
            return { Success: true, ResultCode: 'SUCCESS', Message: `Dropped staging database [${stagingDbName}].`, Params: params.Params };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`[DropSQLServerStagingDatabaseAction] Failure: ${message}`);
            await progress.Fail(message);
            return { Success: false, ResultCode: 'DROP_FAILED', Message: message, Params: params.Params };
        } finally {
            await progress.Flush();
        }
    }

    private async dropStagingAndCredential(
        executor: DatabaseProviderBase,
        stagingDbName: string,
        containerUrl: string | undefined,
        params: RunActionParams
    ): Promise<void> {
        await this.dropStagingDatabase(executor, stagingDbName, params.ContextUser);
        if (containerUrl) {
            await this.dropStorageCredential(executor, containerUrl, params.ContextUser);
        }
    }
}
