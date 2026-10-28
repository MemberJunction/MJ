import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseIntegrationAction } from './BaseIntegrationAction.js';

/**
 * Action that inspects SQL Server backup files (.bak) from Azure Blob Storage or local disk
 * by running RESTORE HEADERONLY and RESTORE FILELISTONLY across all media stripes.
 *
 * Parameters (Input):
 *   - CompanyIntegrationID (optional): ID of the Company Integration being inspected; not used by the inspection
 *   - BackupUrls (required): Single backup URL/path or comma-separated list of URLs/paths for striped sets
 *   - SasToken (optional): Shared Access Signature token for container access
 *   - StorageCredentialID (optional): MJ Credentials record ID storing the SAS token
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
        let containerUrl = '';
        let executor;

        try {
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

            executor = this.getDatabaseProvider(params);

            // Handle Azure storage credential if any URL is present
            const hasUrl = backupUrls.some(u => this.IsUrl(u));
            if (hasUrl) {
                const sasToken = await this.resolveSasToken(params);
                const firstUrl = backupUrls.find(u => this.IsUrl(u))!;
                containerUrl = this.extractContainerUrl(firstUrl);

                LogStatus(`[InspectSQLServerBackupAction] Ensuring storage credential for container '${containerUrl}'...`);
                await this.ensureStorageCredential(executor, containerUrl, sasToken, params.ContextUser);
            }

            // Inspect Header across ALL stripes (Msg 3132 prevention)
            LogStatus(`[InspectSQLServerBackupAction] Reading backup header for ${backupUrls.length} stripe(s)...`);
            const headerInfo = await this.inspectBackupHeader(executor, backupUrls, params.ContextUser);

            // Inspect File List across ALL stripes
            LogStatus(`[InspectSQLServerBackupAction] Reading backup file list for ${backupUrls.length} stripe(s)...`);
            const fileList = await this.inspectBackupFileList(executor, backupUrls, params.ContextUser);

            // Calculate total backup size
            const totalFileBytes = fileList.reduce((acc, f) => acc + (f.SizeBytes ?? 0), 0);
            const backupSizeBytes = headerInfo.BackupSizeBytes ?? totalFileBytes;

            this.addOutputParam(params, 'BackupStartDate', headerInfo.BackupStartDate.toISOString());
            this.addOutputParam(params, 'DatabaseName', headerInfo.DatabaseName);
            this.addOutputParam(params, 'BackupSizeBytes', backupSizeBytes);
            this.addOutputParam(params, 'Stripes', backupUrls.length);
            this.addOutputParam(params, 'Files', JSON.stringify(fileList));

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully inspected backup for '${headerInfo.DatabaseName}' (${fileList.length} files, ${backupSizeBytes.toLocaleString()} bytes). Backup started at ${headerInfo.BackupStartDate.toISOString()}.`,
                Params: params.Params,
            };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`[InspectSQLServerBackupAction] Inspection failed: ${message}`);
            return {
                Success: false,
                ResultCode: 'INSPECTION_FAILED',
                Message: message,
                Params: params.Params,
            };
        } finally {
            if (containerUrl && executor) {
                try {
                    LogStatus(`[InspectSQLServerBackupAction] Cleaning up temporary storage credential '${containerUrl}'...`);
                    await this.dropStorageCredential(executor, containerUrl, params.ContextUser);
                } catch (cleanupErr) {
                    LogError(`[InspectSQLServerBackupAction] Failed to clean up storage credential: ${cleanupErr}`);
                }
            }
        }
    }
}
