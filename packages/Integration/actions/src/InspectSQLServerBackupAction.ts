import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus, DatabaseProviderBase } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseIntegrationAction, type SqlBackupFileListEntry, type SqlBackupHeaderInfo } from './BaseIntegrationAction.js';
import { InvalidBackupParameterError } from './BackupSourceGuard.js';

/** The storage credential an inspection registered, so the `finally` can drop it. */
interface InspectionCredential {
    Executor?: DatabaseProviderBase;
    ContainerUrl: string;
}

/**
 * Action that inspects SQL Server backup files (.bak) from Azure Blob Storage or local disk
 * by running RESTORE HEADERONLY and RESTORE FILELISTONLY across all media stripes.
 *
 * Parameters (Input):
 *   - CompanyIntegrationID (optional): ID of the Company Integration being inspected; not used by the inspection
 *   - BackupUrls (required): Single backup URL/path, or several for a striped set (a JSON array of strings or a comma-separated list);
 *     validated before any SQL (`INVALID_PARAMETER`), as {@link BaseIntegrationAction.BackupInputProblem} describes
 *   - SasToken (optional): Shared Access Signature token for container access
 *   - StorageCredentialID (optional): MJ Credentials record ID storing the SAS token (the caller must be able to read it)
 *
 * Parameters (Output):
 *   - BackupStartDate: ISO UTC timestamp when the backup was initiated
 *   - DatabaseName: Original database name recorded in the backup header
 *   - BackupSizeBytes: Total size of the backup in bytes
 *   - Stripes: Number of media-set files (stripes) the backup spans
 *   - Files: JSON-serialized array of { LogicalName, PhysicalName, Type, SizeBytes }
 */
@RegisterClass(BaseAction, 'Inspect SQL Server Backup')
export class InspectSQLServerBackupAction extends BaseIntegrationAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const credential: InspectionCredential = { ContainerUrl: '' };
        try {
            // An inspection restores nothing, so the staging-directory parameters (which it does not declare) are not read.
            const backupUrls = this.ReadBackupUrls(params, false);
            if (!Array.isArray(backupUrls)) {
                return { Success: false, ResultCode: backupUrls.ResultCode, Message: backupUrls.Message, Params: params.Params };
            }
            credential.Executor = this.GetDatabaseProvider(params);
            if (backupUrls.some(u => this.IsUrl(u))) {
                await this.registerCredential(params, credential, backupUrls);
            }
            return await this.inspect(params, credential.Executor, backupUrls);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`[InspectSQLServerBackupAction] Inspection failed: ${message}`);
            const resultCode = error instanceof InvalidBackupParameterError ? error.ResultCode : 'INSPECTION_FAILED';
            return { Success: false, ResultCode: resultCode, Message: message, Params: params.Params };
        } finally {
            await this.dropCredential(params, credential);
        }
    }

    /** Registers the storage credential for the container of the first URL source. */
    private async registerCredential(params: RunActionParams, credential: InspectionCredential, backupUrls: string[]): Promise<void> {
        const sasToken = await this.ResolveSasToken(params);
        const firstUrl = backupUrls.find(u => this.IsUrl(u))!;
        credential.ContainerUrl = this.ExtractContainerUrl(firstUrl);
        LogStatus(`[InspectSQLServerBackupAction] Ensuring storage credential for container '${credential.ContainerUrl}'...`);
        await this.EnsureStorageCredential(credential.Executor!, credential.ContainerUrl, sasToken, params.ContextUser);
    }

    /** Reads the header and file list across ALL stripes (Msg 3132 prevention) and reports them as outputs. */
    private async inspect(params: RunActionParams, executor: DatabaseProviderBase, backupUrls: string[]): Promise<ActionResultSimple> {
        LogStatus(`[InspectSQLServerBackupAction] Reading backup header for ${backupUrls.length} stripe(s)...`);
        const headerInfo = await this.InspectBackupHeader(executor, backupUrls, params.ContextUser);
        LogStatus(`[InspectSQLServerBackupAction] Reading backup file list for ${backupUrls.length} stripe(s)...`);
        const fileList = await this.InspectBackupFileList(executor, backupUrls, params.ContextUser);
        const backupSizeBytes = this.addInspectionOutputs(params, headerInfo, fileList, backupUrls.length);
        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: `Successfully inspected backup for '${headerInfo.DatabaseName}' (${fileList.length} files, ${backupSizeBytes.toLocaleString()} bytes). Backup started at ${headerInfo.BackupStartDate.toISOString()}.`,
            Params: params.Params,
        };
    }

    /** Records the inspection's outputs; returns the backup size (the header's, else the files' total). */
    private addInspectionOutputs(params: RunActionParams, headerInfo: SqlBackupHeaderInfo, fileList: SqlBackupFileListEntry[], stripes: number): number {
        const totalFileBytes = fileList.reduce((acc, f) => acc + (f.SizeBytes ?? 0), 0);
        const backupSizeBytes = headerInfo.BackupSizeBytes ?? totalFileBytes;
        this.AddOutputParam(params, 'BackupStartDate', headerInfo.BackupStartDate.toISOString());
        this.AddOutputParam(params, 'DatabaseName', headerInfo.DatabaseName);
        this.AddOutputParam(params, 'BackupSizeBytes', backupSizeBytes);
        this.AddOutputParam(params, 'Stripes', stripes);
        this.AddOutputParam(params, 'Files', JSON.stringify(fileList));
        return backupSizeBytes;
    }

    /** Drops the temporary storage credential, if one was registered; a failure is logged, not thrown. */
    private async dropCredential(params: RunActionParams, credential: InspectionCredential): Promise<void> {
        if (!credential.ContainerUrl || !credential.Executor) {
            return;
        }
        try {
            LogStatus(`[InspectSQLServerBackupAction] Cleaning up temporary storage credential '${credential.ContainerUrl}'...`);
            await this.DropStorageCredential(credential.Executor, credential.ContainerUrl, params.ContextUser);
        } catch (cleanupErr) {
            LogError(`[InspectSQLServerBackupAction] Failed to clean up storage credential: ${cleanupErr}`);
        }
    }
}
