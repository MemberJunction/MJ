import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogError, LogStatus } from '@memberjunction/core';
import { ArchiveEngine } from '@memberjunction/archiving-engine';

/**
 * Action that executes an archive run for a given ArchiveConfiguration.
 * Delegates to ArchiveEngine.Instance.RunArchive() and maps the result
 * to an ActionResultSimple.
 *
 * Required Parameters:
 *   - ConfigurationID: ID of the ArchiveConfiguration to execute
 */
@RegisterClass(BaseAction, 'Archive Data')
export class ArchiveDataAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const configId = this.GetParamValue(params, 'configurationid');
        if (!configId) {
            return {
                Success: false,
                ResultCode: 'MISSING_CONFIGURATION_ID',
                Message: 'ConfigurationID parameter is required',
            };
        }

        try {
            LogStatus(`ArchiveDataAction: Starting archive run for configuration ${configId}`);
            const result = await ArchiveEngine.Instance.RunArchive(configId, params.ContextUser);

            if (result.Success) {
                return {
                    Success: true,
                    ResultCode: 'ARCHIVE_COMPLETE',
                    Message:
                        `Archive run ${result.ArchiveRunId} completed successfully. ` +
                        `Archived: ${result.ArchivedRecords}, Skipped: ${result.SkippedRecords}, ` +
                        `Failed: ${result.FailedRecords}, Bytes: ${result.TotalBytesArchived}`,
                };
            }

            return {
                Success: false,
                ResultCode: 'ARCHIVE_FAILED',
                Message: result.ErrorMessage ?? 'Archive run failed with no error message',
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`ArchiveDataAction failed: ${message}`);
            return {
                Success: false,
                ResultCode: 'ARCHIVE_ERROR',
                Message: message,
            };
        }
    }

    /**
     * Extracts a parameter value by name (case-insensitive) from the action params.
     */
    private GetParamValue(params: RunActionParams, name: string): string | undefined {
        const lowerName = name.toLowerCase();
        const param = params.Params.find(p => p.Name.toLowerCase() === lowerName);
        return param?.Value != null ? String(param.Value) : undefined;
    }
}
