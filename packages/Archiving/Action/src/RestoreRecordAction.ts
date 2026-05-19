import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogError, LogStatus } from '@memberjunction/core';
import { ArchiveEngine } from '@memberjunction/archiving-engine';

/**
 * Action that restores a previously archived record version.
 * Delegates to ArchiveEngine.Instance.Recovery.RestoreVersion() and maps
 * the result to an ActionResultSimple.
 *
 * Required Parameters:
 *   - ArchiveRunDetailID: ID of the ArchiveRunDetail record to restore
 */
@RegisterClass(BaseAction, 'Restore Archived Record')
export class RestoreRecordAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const detailId = this.GetParamValue(params, 'archiverundetailid');
        if (!detailId) {
            return {
                Success: false,
                ResultCode: 'MISSING_DETAIL_ID',
                Message: 'ArchiveRunDetailID parameter is required',
            };
        }

        try {
            LogStatus(`RestoreRecordAction: Restoring archived version from detail ${detailId}`);
            const result = await ArchiveEngine.Instance.Recovery.RestoreVersion(detailId, params.ContextUser);

            if (result.Success) {
                return {
                    Success: true,
                    ResultCode: 'RESTORE_COMPLETE',
                    Message:
                        `Record restored successfully. ` +
                        `Restored fields: ${result.RestoredFields.join(', ') || 'none'}`,
                };
            }

            return {
                Success: false,
                ResultCode: 'RESTORE_FAILED',
                Message: result.ErrorMessage ?? 'Restore failed with no error message',
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`RestoreRecordAction failed: ${message}`);
            return {
                Success: false,
                ResultCode: 'RESTORE_ERROR',
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
